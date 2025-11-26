package server

import (
	"context"
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
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/swagger"
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
	db := database.Connect(cfg)

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
	// Logger middleware
	app.Use(logger.New(logger.Config{
		Format:     "${time} ${method} ${path} ${status} ${latency}\n",
		TimeFormat: "2006/01/02 15:04:05",
	}))

	// CORS middleware with more restrictive settings
	app.Use(cors.New(cors.Config{
		AllowOrigins:     "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173", // Allow localhost origins
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization",
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
	publicPosts.Get(":id", s.GetPost)
	publicPosts.Get(":id/comments", s.GetComments)

	// Protected routes
	protected := api.Group("", s.AuthRequired())

	// User routes
	users := protected.Group("/users")
	users.Get("/me", s.GetMyProfile)
	users.Put("/me", s.UpdateMyProfile)
	users.Get("/", s.GetAllUsers)
	users.Get(":id", s.GetUserProfile)
	users.Get(":id/cached", s.GetUserCached)
	users.Get("/:id/posts", s.GetUserPosts)

	// Friend routes
	friends := protected.Group("/friends")
	friends.Post("/requests/:userId", s.SendFriendRequest)
	friends.Get("/requests", s.GetPendingRequests)
	friends.Get("/requests/sent", s.GetSentRequests)
	friends.Post("/requests/:requestId/accept", s.AcceptFriendRequest)
	friends.Post("/requests/:requestId/reject", s.RejectFriendRequest)
	friends.Get("/", s.GetFriends)
	friends.Get("/status/:userId", s.GetFriendshipStatus)
	friends.Delete("/:userId", s.RemoveFriend)

	// Protected post routes
	posts := protected.Group("/posts")
	posts.Post("/", s.CreatePost)
	posts.Put(":id", s.UpdatePost)
	posts.Delete(":id", s.DeletePost)
	posts.Post(":id/like", s.LikePost)
	posts.Delete(":id/like", s.UnlikePost)
	posts.Post(":id/comments", s.CreateComment)
	posts.Put(":id/comments/:commentId", s.UpdateComment)
	posts.Delete(":id/comments/:commentId", s.DeleteComment)

	// Chat routes
	conversations := protected.Group("/conversations")
	conversations.Post("/", s.CreateConversation)
	conversations.Get("/", s.GetConversations)
	conversations.Get("/:id", s.GetConversation)
	conversations.Post("/:id/messages", middleware.RateLimit(s.redis, 30, time.Minute), s.SendMessage)
	conversations.Get("/:id/messages", s.GetMessages)
	conversations.Post("/:id/participants", s.AddParticipant)

	// Websocket endpoints
	api.Get("/ws", s.WebsocketHandler())          // General notifications
	api.Get("/ws/chat", s.WebSocketChatHandler()) // Real-time chat
}

// HealthCheck handles health check requests
func (s *Server) HealthCheck(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"message": "Vibecheck successful",
		"version": "1.0.0",
		"status":  "healthy",
	})
}

// AuthRequired returns the authentication middleware
func (s *Server) AuthRequired() fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
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
		if issuer, ok := claims["iss"].(string); !ok || issuer != "vibeshift-api" {
			return models.RespondWithError(c, fiber.StatusUnauthorized,
				models.NewUnauthorizedError("Invalid token issuer"))
		}
		if audience, ok := claims["aud"].(string); !ok || audience != "vibeshift-client" {
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
			// best-effort wiring; ignores error
			_ = s.hub.StartWiring(context.Background(), s.notifier)
		}()
	}

	// Wire chat hub to Redis subscriber if available
	if s.chatHub != nil && s.notifier != nil {
		go func() {
			_ = s.chatHub.StartWiring(context.Background(), s.notifier)
		}()
	}

	log.Printf("Server starting on port %s...", s.config.Port)
	return app.Listen(":" + s.config.Port)
}

// Shutdown gracefully shuts down the server
func (s *Server) Shutdown(ctx context.Context) error {
	// Close database connection
	if sqlDB, err := s.db.DB(); err == nil {
		sqlDB.Close()
	}

	// Close Redis connection
	s.redis.Close()

	log.Println("Server shutdown complete")
	return nil
}
