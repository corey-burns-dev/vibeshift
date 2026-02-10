// Package server contains HTTP and WebSocket handlers for the application's API endpoints.
package server

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	_ "sanctum/docs" // swagger docs
	"sanctum/internal/cache"
	"sanctum/internal/config"
	"sanctum/internal/database"
	"sanctum/internal/middleware"
	"sanctum/internal/models"
	"sanctum/internal/notifications"
	"sanctum/internal/repository"
	"sanctum/internal/seed"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/helmet"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/monitor"
	"github.com/gofiber/fiber/v2/middleware/requestid"
	"github.com/gofiber/swagger"
	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// wireableHub is implemented by every WebSocket hub that can be wired to
// Redis pub/sub and gracefully shut down.
type wireableHub interface {
	Name() string
	StartWiring(ctx context.Context, n *notifications.Notifier) error
	Shutdown(ctx context.Context) error
}

// Server holds all dependencies and provides handlers
type Server struct {
	config       *config.Config
	db           *gorm.DB
	redis        *redis.Client
	app          *fiber.App
	shutdownCtx  context.Context
	shutdownFn   context.CancelFunc
	userRepo     repository.UserRepository
	postRepo     repository.PostRepository
	commentRepo  repository.CommentRepository
	chatRepo     repository.ChatRepository
	friendRepo   repository.FriendRepository
	gameRepo     repository.GameRepository
	streamRepo   repository.StreamRepository
	notifier     *notifications.Notifier
	hub          *notifications.Hub
	chatHub      *notifications.ChatHub
	gameHub      *notifications.GameHub
	videoChatHub *notifications.VideoChatHub
	hubs         []wireableHub // all hubs for wiring/shutdown iteration
}

// NewServer creates a new server instance with all dependencies
func NewServer(cfg *config.Config) (*Server, error) {
	// Initialize database
	db, err := database.Connect(cfg)
	if err != nil {
		return nil, fmt.Errorf("database connection failed: %w", err)
	}

	// Initialize Redis
	cache.InitRedis(cfg.RedisURL)
	redisClient := cache.GetClient()

	// Initialize repositories
	userRepo := repository.NewUserRepository(db)
	postRepo := repository.NewPostRepository(db)
	commentRepo := repository.NewCommentRepository(db)
	chatRepo := repository.NewChatRepository(db)
	friendRepo := repository.NewFriendRepository(db)
	gameRepo := repository.NewGameRepository(db)
	streamRepo := repository.NewStreamRepository(db)

	server := &Server{
		config:      cfg,
		db:          db,
		redis:       redisClient,
		userRepo:    userRepo,
		postRepo:    postRepo,
		commentRepo: commentRepo,
		chatRepo:    chatRepo,
		friendRepo:  friendRepo,
		gameRepo:    gameRepo,
		streamRepo:  streamRepo,
	}

	if err := seed.Sanctums(db); err != nil {
		return nil, fmt.Errorf("failed to seed built-in sanctums: %w", err)
	}

	// Initialize notifier and hub if Redis is available
	if redisClient != nil {
		server.notifier = notifications.NewNotifier(redisClient)
		server.hub = notifications.NewHub()
		server.chatHub = notifications.NewChatHub()
		server.gameHub = notifications.NewGameHub(db, server.notifier)
		server.videoChatHub = notifications.NewVideoChatHub()
		server.hubs = []wireableHub{server.hub, server.chatHub, server.gameHub, server.videoChatHub}
	}

	return server, nil
}

// SetupMiddleware configures middleware for the Fiber app
func (s *Server) SetupMiddleware(app *fiber.App) {
	// Request ID for tracing
	app.Use(requestid.New())

	// Security headers
	app.Use(helmet.New())

	// Structured Logging middleware
	app.Use(middleware.StructuredLogger())

	// CORS middleware should run before middlewares that can short-circuit (e.g. limiter)
	// so browser clients still receive CORS headers on error responses.
	origins := s.config.AllowedOrigins
	if origins == "" {
		origins = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"
	}

	app.Use(cors.New(cors.Config{
		AllowOrigins:     origins,
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization, Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version",
		AllowCredentials: true,
		MaxAge:           86400, // 24 hours
	}))

	// Global rate limiting (100 requests per minute per IP)
	app.Use(limiter.New(limiter.Config{
		Max:        100,
		Expiration: 1 * time.Minute,
		// Never rate-limit preflight requests; they should be handled by CORS.
		Next: func(c *fiber.Ctx) bool {
			return c.Method() == fiber.MethodOptions
		},
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error": "Too many requests, please try again later.",
			})
		},
	}))
}

// SetupRoutes configures all routes for the application
func (s *Server) SetupRoutes(app *fiber.App) {
	api := app.Group("/api")

	// Health check
	api.Get("/", s.HealthCheck)

	// Metrics endpoint for Prometheus
	api.Get("/metrics", monitor.New(monitor.Config{
		Title: "Sanctum Backend Metrics",
	}))

	// Swagger documentation
	api.Get("/swagger/*", swagger.HandlerDefault)

	// Auth routes
	auth := api.Group("/auth")
	auth.Post("/signup", middleware.RateLimit(s.redis, 3, 10*time.Minute, "signup"), s.Signup)
	auth.Post("/login", middleware.RateLimit(s.redis, 10, 5*time.Minute, "login"), s.Login)

	// Public post routes (browse/search)
	publicPosts := api.Group("/posts")
	publicPosts.Get("/", s.GetPosts)
	publicPosts.Get("/search", middleware.RateLimit(s.redis, 10, time.Minute, "search"), s.SearchPosts)
	publicPosts.Get("/:id/comments", s.GetComments)
	publicPosts.Get("/:id", s.GetPost)

	// Public sanctum routes
	sanctums := api.Group("/sanctums")
	sanctums.Get("/", s.GetSanctums)
	sanctums.Get("/:slug", s.GetSanctumBySlug)

	// Protected routes
	protected := api.Group("", s.AuthRequired())

	// Sanctum request routes
	sanctumRequests := protected.Group("/sanctums/requests")
	sanctumRequests.Post("/", s.CreateSanctumRequest)
	sanctumRequests.Get("/me", s.GetMySanctumRequests)
	sanctumMemberships := protected.Group("/sanctums/memberships")
	sanctumMemberships.Get("/me", s.GetMySanctumMemberships)
	sanctumMemberships.Post("/bulk", s.UpsertMySanctumMemberships)

	// User routes
	users := protected.Group("/users")
	users.Get("/me", s.GetMyProfile)
	users.Put("/me", s.UpdateMyProfile)
	users.Get("/", s.GetAllUsers)
	// Define specific /:id/:resource routes BEFORE generic /:id route
	users.Get("/:id/cached", s.GetUserCached)
	users.Get("/:id/posts", s.GetUserPosts)
	users.Post("/:id/promote-admin", s.AdminRequired(), s.PromoteToAdmin)
	users.Post("/:id/demote-admin", s.AdminRequired(), s.DemoteFromAdmin)
	users.Get("/:id", s.GetUserProfile)

	// Friend routes
	friends := protected.Group("/friends")
	friends.Get("/", s.GetFriends)
	// Specific /requests routes before generic /:userId
	friends.Post("/requests/:userId", middleware.RateLimit(s.redis, 5, 5*time.Minute, "friend_request"), s.SendFriendRequest)
	friends.Get("/requests", s.GetPendingRequests)
	friends.Get("/requests/sent", s.GetSentRequests)
	friends.Post("/requests/:requestId/accept", s.AcceptFriendRequest)
	friends.Post("/requests/:requestId/reject", s.RejectFriendRequest)
	// Specific /status routes before generic /:userId
	friends.Get("/status/:userId", s.GetFriendshipStatus)
	// Generic /:userId route must be last
	friends.Delete("/:userId", s.RemoveFriend)

	// Protected post routes
	posts := protected.Group("/posts")
	posts.Post("/", middleware.RateLimit(s.redis, 1, 5*time.Minute, "create_post"), s.CreatePost)
	// Define specific /:id/:resource routes BEFORE generic /:id route
	posts.Post("/:id/like", s.LikePost)
	posts.Delete("/:id/like", s.UnlikePost)
	posts.Post("/:id/comments", middleware.RateLimit(s.redis, 1, time.Minute, "create_comment"), s.CreateComment)
	posts.Put("/:id/comments/:commentId", s.UpdateComment)
	posts.Delete("/:id/comments/:commentId", s.DeleteComment)
	// Generic /:id routes (for item detail, update, delete)
	posts.Put("/:id", s.UpdatePost)
	posts.Delete("/:id", s.DeletePost)

	// Chat routes
	conversations := protected.Group("/conversations")
	conversations.Post("/", s.CreateConversation)
	conversations.Get("/", s.GetConversations)
	// Define specific /:id/:resource routes BEFORE generic /:id route
	conversations.Get("/:id/messages", s.GetMessages)
	conversations.Post("/:id/messages", middleware.RateLimit(s.redis, 15, time.Minute, "send_chat"), s.SendMessage)
	conversations.Post("/:id/participants", s.AddParticipant)
	conversations.Delete("/:id", s.LeaveConversation)
	// Generic /:id route must be last
	conversations.Get("/:id", s.GetConversation)

	// Chatrooms routes (public group conversations)
	chatrooms := protected.Group("/chatrooms")
	chatrooms.Get("/", s.GetAllChatrooms)                                     // Get ALL public chatrooms
	chatrooms.Get("/joined", s.GetJoinedChatrooms)                            // Get rooms user has joined
	chatrooms.Post("/:id/join", s.JoinChatroom)                               // Join a chatroom
	chatrooms.Delete("/:id/participants/:participantId", s.RemoveParticipant) // Remove participant (admin/creator only)

	// Game routes
	games := protected.Group("/games")
	games.Post("/rooms", s.CreateGameRoom)
	games.Get("/rooms/active", s.GetActiveGameRooms)
	games.Post("/rooms/:id/leave", s.LeaveGameRoom)
	games.Get("/stats/:type", s.GetGameStats)
	games.Get("/rooms/:id", s.GetGameRoom)

	// Stream routes - public browse
	publicStreams := api.Group("/streams")
	publicStreams.Get("/", s.GetStreams)
	publicStreams.Get("/categories", s.GetStreamCategories)
	publicStreams.Get("/:id", s.GetStream)
	publicStreams.Get("/:id/messages", s.GetStreamMessages)

	// Stream routes - protected
	streams := protected.Group("/streams")
	streams.Get("/me", s.GetMyStreams)
	streams.Post("/", s.CreateStream)
	streams.Put("/:id", s.UpdateStream)
	streams.Delete("/:id", s.DeleteStream)
	streams.Post("/:id/go-live", s.GoLive)
	streams.Post("/:id/end", s.EndStream)
	streams.Post("/:id/messages", middleware.RateLimit(s.redis, 30, time.Minute, "stream_chat"), s.SendStreamMessage)

	// Websocket endpoints - protected by AuthRequired
	ws := api.Group("/ws", s.AuthRequired())
	ws.Get("/", s.WebsocketHandler())                   // General notifications
	ws.Get("/chat", s.WebSocketChatHandler())           // Real-time chat
	ws.Get("/game", s.WebSocketGameHandler())           // Multiplayer games
	ws.Get("/videochat", s.WebSocketVideoChatHandler()) // WebRTC video chat signaling

	// Admin routes
	admin := protected.Group("/admin", s.AdminRequired())
	adminSanctumRequests := admin.Group("/sanctum-requests")
	adminSanctumRequests.Get("/", s.GetAdminSanctumRequests)
	adminSanctumRequests.Post("/:id/approve", s.ApproveSanctumRequest)
	adminSanctumRequests.Post("/:id/reject", s.RejectSanctumRequest)
}

// HealthCheck handles health check requests
func (s *Server) HealthCheck(c *fiber.Ctx) error {
	ctx, cancel := context.WithTimeout(c.Context(), 5*time.Second)
	defer cancel()

	dbStatus := "healthy"
	sqlDB, err := s.db.DB()
	if err != nil {
		dbStatus = "unhealthy"
	} else if err := sqlDB.PingContext(ctx); err != nil {
		dbStatus = "unhealthy"
	}

	redisStatus := "healthy"
	if s.redis != nil {
		if err := s.redis.Ping(ctx).Err(); err != nil {
			redisStatus = "unhealthy"
		}
	} else {
		redisStatus = "unavailable"
	}

	status := fiber.StatusOK
	overallStatus := "healthy"
	if dbStatus == "unhealthy" || redisStatus == "unhealthy" {
		status = fiber.StatusServiceUnavailable
		overallStatus = "unhealthy"
	}

	return c.Status(status).JSON(fiber.Map{
		"message": "Vibecheck",
		"version": "1.0.0",
		"status":  overallStatus,
		"checks": fiber.Map{
			"database": dbStatus,
			"redis":    redisStatus,
		},
		"time": time.Now(),
	})
}

// AdminRequired returns middleware that rejects non-admin users with 403.
// Must be placed after AuthRequired so that userID is available in locals.
func (s *Server) AdminRequired() fiber.Handler {
	return func(c *fiber.Ctx) error {
		userID := c.Locals("userID").(uint)

		admin, err := s.isAdmin(c, userID)
		if err != nil {
			return models.RespondWithError(c, fiber.StatusInternalServerError, err)
		}
		if !admin {
			return models.RespondWithError(c, fiber.StatusForbidden,
				models.NewUnauthorizedError("Admin access required"))
		}

		return c.Next()
	}
}

// AuthRequired returns the authentication middleware
func (s *Server) AuthRequired() fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Extract token from "Bearer <token>" or "token" query parameter (for WebSockets)
		authHeader := c.Get("Authorization")
		tokenString := ""
		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) == 2 && parts[0] == "Bearer" {
				tokenString = parts[1]
			}
		}

		if tokenString == "" {
			tokenString = c.Query("token")
		}

		if tokenString == "" {
			return models.RespondWithError(c, fiber.StatusUnauthorized,
				models.NewUnauthorizedError("Authorization required"))
		}

		// Parse and validate token
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
			// Validate signing method
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fiber.NewError(fiber.StatusUnauthorized, "Invalid signing method")
			}
			return []byte(s.config.JWTSecret), nil
		})

		if err != nil || !token.Valid {
			return models.RespondWithError(c, fiber.StatusUnauthorized,
				models.NewUnauthorizedError("Invalid or expired token"))
		}

		// Extract claims
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return models.RespondWithError(c, fiber.StatusUnauthorized,
				models.NewUnauthorizedError("Invalid token claims"))
		}

		// Validate issuer and audience
		if issuer, issuerOk := claims["iss"].(string); !issuerOk || (issuer != "sanctum-api" && issuer != "vibeshift-api") {
			return models.RespondWithError(c, fiber.StatusUnauthorized,
				models.NewUnauthorizedError("Invalid token issuer"))
		}
		if audience, audienceOk := claims["aud"].(string); !audienceOk || (audience != "sanctum-client" && audience != "vibeshift-client") {
			return models.RespondWithError(c, fiber.StatusUnauthorized,
				models.NewUnauthorizedError("Invalid token audience"))
		}

		// Extract user ID from subject claim
		sub, ok := claims["sub"].(string)
		if !ok {
			return models.RespondWithError(c, fiber.StatusUnauthorized,
				models.NewUnauthorizedError("Invalid subject claim"))
		}

		userID, err := strconv.ParseUint(sub, 10, 32)
		if err != nil {
			return models.RespondWithError(c, fiber.StatusUnauthorized,
				models.NewUnauthorizedError("Invalid user ID in token"))
		}

		// Optional: Check JTI for replay attack prevention (can be disabled in dev)
		if jti, exists := claims["jti"].(string); exists && jti != "" {
			// In a real implementation, you'd check Redis/cache for used JTIs
			// For now, we'll just validate it exists
			if len(jti) < 10 { // Basic validation
				return models.RespondWithError(c, fiber.StatusUnauthorized,
					models.NewUnauthorizedError("Invalid token ID"))
			}
		}

		// Store user ID in context
		c.Locals("userID", uint(userID))

		return c.Next()
	}
}

// optionalUserID attempts to extract userID from Authorization header but does not enforce it.
func (s *Server) optionalUserID(c *fiber.Ctx) (uint, bool) {
	authHeader := c.Get("Authorization")
	if authHeader == "" {
		return 0, false
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || parts[0] != "Bearer" {
		return 0, false
	}

	tokenString := parts[1]
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fiber.NewError(fiber.StatusUnauthorized, "Invalid signing method")
		}
		return []byte(s.config.JWTSecret), nil
	})
	if err != nil || !token.Valid {
		return 0, false
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return 0, false
	}

	sub, ok := claims["sub"].(string)
	if !ok {
		return 0, false
	}
	userID, err := strconv.ParseUint(sub, 10, 32)
	if err != nil {
		return 0, false
	}
	return uint(userID), true
}

// Start starts the server
func (s *Server) Start() error {
	ctx, cancel := context.WithCancel(context.Background())
	s.shutdownCtx = ctx
	s.shutdownFn = cancel

	app := fiber.New(fiber.Config{
		AppName: "Social Media API",
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			// Custom error handler
			log.Printf("Error: %v", err)
			return models.RespondWithError(c, fiber.StatusInternalServerError,
				models.NewInternalError(err))
		},
	})
	s.app = app

	s.SetupMiddleware(app)
	s.SetupRoutes(app)

	// Wire all hubs to Redis subscriber if available
	if s.notifier != nil {
		for _, h := range s.hubs {
			h := h
			go func() {
				if err := h.StartWiring(s.shutdownCtx, s.notifier); err != nil {
					log.Printf("failed to start %s wiring: %v", h.Name(), err)
				}
			}()
		}
	}

	log.Printf("Server starting on port %s...", s.config.Port)
	return app.Listen(":" + s.config.Port)
}

// Shutdown gracefully shuts down the server
func (s *Server) Shutdown(ctx context.Context) error {
	// Cancel the server-scoped context to stop all wiring goroutines
	if s.shutdownFn != nil {
		s.shutdownFn()
	}

	// Shutdown the HTTP/WS server
	if s.app != nil {
		if err := s.app.ShutdownWithContext(ctx); err != nil {
			log.Printf("error shutting down HTTP server: %v", err)
		}
	}

	// Close WebSocket connections gracefully
	for _, h := range s.hubs {
		if err := h.Shutdown(ctx); err != nil {
			log.Printf("error shutting down %s: %v", h.Name(), err)
		}
	}

	// Close database connection
	if sqlDB, err := s.db.DB(); err == nil {
		if cerr := sqlDB.Close(); cerr != nil {
			log.Printf("error closing sql DB: %v", cerr)
		}
	}

	// Close Redis connection
	if s.redis != nil {
		if rerr := s.redis.Close(); rerr != nil {
			log.Printf("error closing redis: %v", rerr)
		}
	}

	log.Println("Server shutdown complete")
	return nil
}
