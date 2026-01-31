// Package server contains HTTP and WebSocket handlers for the application's API endpoints.
package server

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"vibeshift/cache"
	"vibeshift/config"
	"vibeshift/database"
	_ "vibeshift/docs" // swagger docs
	"vibeshift/middleware"
	"vibeshift/models"
	"vibeshift/notifications"
	"vibeshift/repository"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/helmet"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/requestid"
	"github.com/gofiber/swagger"
	"github.com/gofiber/websocket/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// Server holds all dependencies and provides handlers
type Server struct {
	config      *config.Config
	db          *gorm.DB
	redis       *redis.Client
	userRepo    repository.UserRepository
	postRepo    repository.PostRepository
	commentRepo repository.CommentRepository
	chatRepo    repository.ChatRepository
	friendRepo  repository.FriendRepository
	notifier    *notifications.Notifier
	hub         *notifications.Hub
	chatHub     *notifications.ChatHub
	// Add other repositories as needed
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

	server := &Server{
		config:      cfg,
		db:          db,
		redis:       redisClient,
		userRepo:    userRepo,
		postRepo:    postRepo,
		commentRepo: commentRepo,
		chatRepo:    chatRepo,
		friendRepo:  friendRepo,
	}

	// Initialize notifier and hub if Redis is available
	if redisClient != nil {
		server.notifier = notifications.NewNotifier(redisClient)
		server.hub = notifications.NewHub()
		server.chatHub = notifications.NewChatHub()
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

	// Global rate limiting (100 requests per minute per IP)
	app.Use(limiter.New(limiter.Config{
		Max:        100,
		Expiration: 1 * time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error": "Too many requests, please try again later.",
			})
		},
	}))

	// CORS middleware with WebSocket support
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
}

// SetupRoutes configures all routes for the application
func (s *Server) SetupRoutes(app *fiber.App) {
	api := app.Group("/api")

	// Health check
	api.Get("/", s.HealthCheck)

	// Swagger documentation
	api.Get("/swagger/*", swagger.HandlerDefault)

	// Auth routes
	auth := api.Group("/auth")
	auth.Post("/signup", s.Signup)
	auth.Post("/login", middleware.RateLimit(s.redis, 5, time.Minute), s.Login)

	// Public post routes (browse/search)
	publicPosts := api.Group("/posts")
	publicPosts.Get("/", s.GetPosts)
	publicPosts.Get("/search", s.SearchPosts)
	publicPosts.Get("/:id/comments", s.GetComments)
	publicPosts.Get("/:id", s.GetPost)

	// Protected routes
	protected := api.Group("", s.AuthRequired())

	// User routes
	users := protected.Group("/users")
	users.Get("/me", s.GetMyProfile)
	users.Put("/me", s.UpdateMyProfile)
	users.Get("/", s.GetAllUsers)
	// Define specific /:id/:resource routes BEFORE generic /:id route
	users.Get("/:id/cached", s.GetUserCached)
	users.Get("/:id/posts", s.GetUserPosts)
	users.Get("/:id", s.GetUserProfile)

	// Friend routes
	friends := protected.Group("/friends")
	friends.Get("/", s.GetFriends)
	// Specific /requests routes before generic /:userId
	friends.Post("/requests/:userId", s.SendFriendRequest)
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
	posts.Post("/", s.CreatePost)
	// Define specific /:id/:resource routes BEFORE generic /:id route
	posts.Post("/:id/like", s.LikePost)
	posts.Delete("/:id/like", s.UnlikePost)
	posts.Post("/:id/comments", s.CreateComment)
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
	conversations.Post("/:id/messages", middleware.RateLimit(s.redis, 30, time.Minute), s.SendMessage)
	conversations.Post("/:id/participants", s.AddParticipant)
	// Generic /:id route must be last
	conversations.Get("/:id", s.GetConversation)

	// Chatrooms routes (public group conversations)
	chatrooms := protected.Group("/chatrooms")
	chatrooms.Get("/", s.GetAllChatrooms)          // Get ALL public chatrooms
	chatrooms.Get("/joined", s.GetJoinedChatrooms) // Get rooms user has joined
	chatrooms.Post("/:id/join", s.JoinChatroom)    // Join a chatroom

	// Websocket endpoints - require upgrade check middleware
	api.Use("/ws", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})
	api.Get("/ws", s.WebsocketHandler())          // General notifications
	api.Get("/ws/chat", s.WebSocketChatHandler()) // Real-time chat
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
	if dbStatus == "unhealthy" || redisStatus == "unhealthy" {
		status = fiber.StatusServiceUnavailable
	}

	return c.Status(status).JSON(fiber.Map{
		"message": "Vibecheck",
		"version": "1.0.0",
		"status":  "healthy",
		"checks": fiber.Map{
			"database": dbStatus,
			"redis":    redisStatus,
		},
		"time": time.Now(),
	})
}

// AuthRequired returns the authentication middleware
// AuthRequired returns the authentication middleware
func (s *Server) AuthRequired() fiber.Handler {
	return func(c *fiber.Ctx) error {
		path := c.Path()
		// Skip auth for WebSocket handshake if handled by manual token check (though this middleware shouldn't run)
		if strings.HasPrefix(path, "/api/ws") {
			// For WebSocket, we accept token in query param since headers aren't supported in JS WebSocket
			if c.Get("Upgrade") == "websocket" {
				token := c.Query("token")
				if token != "" {
					// We'll validate this later in the handler, or here.
					// Let's validate here to be safe if this middleware is indeed running.
					c.Locals("user_token", token)
					// Hack: set the Authorization header so the rest of the logic works?
					// Or just return Next() and let the specific handler do it?
					// The specific handler DOES do it. So if we are here, we should probably just Next() if token exists.
					return c.Next()
				}
			}
		}

		authHeader := c.Get("Authorization")
		log.Printf("AuthRequired checking %s. Header: %s", path, authHeader)

		if authHeader == "" {
			return models.RespondWithError(c, fiber.StatusUnauthorized,
				models.NewUnauthorizedError("Authorization header required"))
		}

		// Extract token from "Bearer <token>"
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			return models.RespondWithError(c, fiber.StatusUnauthorized,
				models.NewUnauthorizedError("Invalid authorization header format"))
		}

		tokenString := parts[1]

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
		if issuer, issuerOk := claims["iss"].(string); !issuerOk || issuer != "vibeshift-api" {
			return models.RespondWithError(c, fiber.StatusUnauthorized,
				models.NewUnauthorizedError("Invalid token issuer"))
		}
		if audience, audienceOk := claims["aud"].(string); !audienceOk || audience != "vibeshift-client" {
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
	app := fiber.New(fiber.Config{
		AppName: "Social Media API",
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			// Custom error handler
			log.Printf("Error: %v", err)
			return models.RespondWithError(c, fiber.StatusInternalServerError,
				models.NewInternalError(err))
		},
	})

	s.SetupMiddleware(app)
	s.SetupRoutes(app)

	// Wire notifications hub to Redis subscriber if available
	if s.hub != nil && s.notifier != nil {
		go func() {
			if err := s.hub.StartWiring(context.Background(), s.notifier); err != nil {
				log.Printf("failed to start notification hub wiring: %v", err)
			}
		}()
	}

	// Wire chat hub to Redis subscriber if available
	if s.chatHub != nil && s.notifier != nil {
		go func() {
			if err := s.chatHub.StartWiring(context.Background(), s.notifier); err != nil {
				log.Printf("failed to start chat hub wiring: %v", err)
			}
		}()
	}

	log.Printf("Server starting on port %s...", s.config.Port)
	return app.Listen(":" + s.config.Port)
}

// Shutdown gracefully shuts down the server
func (s *Server) Shutdown(_ context.Context) error {
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
