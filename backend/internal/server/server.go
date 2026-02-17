// Package server contains HTTP and WebSocket handlers for the application's API endpoints.
package server

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "sanctum/docs" // swagger docs
	"sanctum/internal/cache"
	"sanctum/internal/config"
	"sanctum/internal/database"
	"sanctum/internal/featureflags"
	"sanctum/internal/middleware"
	"sanctum/internal/models"
	"sanctum/internal/notifications"
	"sanctum/internal/repository"
	"sanctum/internal/service"

	"github.com/ansrivas/fiberprometheus/v2"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/helmet"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/monitor"
	"github.com/gofiber/fiber/v2/middleware/recover"
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

// consumedTicketEntry is an in-process cache entry for consumed WebSocket tickets.
// Fiber's websocket upgrade may call AuthRequired twice during the multi-pass
// handshake, so we cache the consumed ticket briefly to allow the second pass
// without weakening the atomic GETDEL security guarantees.
type consumedTicketEntry struct {
	userID    uint
	consumeAt time.Time
}

// Server holds all dependencies and provides handlers
type Server struct {
	config            *config.Config
	db                *gorm.DB
	redis             *redis.Client
	app               *fiber.App
	promMiddleware    *fiberprometheus.FiberPrometheus
	shutdownCtx       context.Context
	shutdownFn        context.CancelFunc
	userRepo          repository.UserRepository
	postRepo          repository.PostRepository
	pollRepo          repository.PollRepository
	imageRepo         repository.ImageRepository
	commentRepo       repository.CommentRepository
	chatRepo          repository.ChatRepository
	friendRepo        repository.FriendRepository
	gameRepo          repository.GameRepository
	streamRepo        repository.StreamRepository
	notifier          *notifications.Notifier
	hub               *notifications.Hub
	chatHub           *notifications.ChatHub
	gameHub           *notifications.GameHub
	videoChatHub      *notifications.VideoChatHub
	hubs              []wireableHub // all hubs for wiring/shutdown iteration
	featureFlags      *featureflags.Manager
	postService       *service.PostService
	imageService      *service.ImageService
	commentService    *service.CommentService
	chatService       *service.ChatService
	userService       *service.UserService
	moderationService *service.ModerationService
	gameService       *service.GameService

	// consumedTickets is a short-lived in-process cache allowing the WS upgrade
	// multi-pass handshake to succeed after GETDEL has atomically consumed the
	// ticket from Redis.
	consumedTicketsMu sync.Mutex
	consumedTickets   map[string]consumedTicketEntry
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
	pollRepo := repository.NewPollRepository(db)
	imageRepo := repository.NewImageRepository(db)
	commentRepo := repository.NewCommentRepository(db)
	chatRepo := repository.NewChatRepository(db)
	friendRepo := repository.NewFriendRepository(db)
	gameRepo := repository.NewGameRepository(db)
	streamRepo := repository.NewStreamRepository(db)

	// Initialize Prometheus metrics
	prom := middleware.InitMetrics("sanctum-api")

	// Initialize Logger with correct env
	middleware.InitLogger(cfg.Env)

	server := &Server{
		config:          cfg,
		db:              db,
		redis:           redisClient,
		promMiddleware:  prom,
		userRepo:        userRepo,
		postRepo:        postRepo,
		pollRepo:        pollRepo,
		imageRepo:       imageRepo,
		commentRepo:     commentRepo,
		chatRepo:        chatRepo,
		friendRepo:      friendRepo,
		gameRepo:        gameRepo,
		streamRepo:      streamRepo,
		featureFlags:    featureflags.NewManager(cfg.FeatureFlags),
		consumedTickets: make(map[string]consumedTicketEntry),
	}
	server.postService = service.NewPostService(server.postRepo, server.pollRepo, server.isAdminByUserID)
	server.imageService = service.NewImageService(server.imageRepo, cfg)
	server.commentService = service.NewCommentService(server.commentRepo, server.postRepo, server.isAdminByUserID)
	server.chatService = service.NewChatService(
		server.chatRepo,
		server.userRepo,
		server.db,
		server.isAdminByUserID,
		server.canModerateChatroomByUserID,
	)
	server.userService = service.NewUserService(server.userRepo)
	server.moderationService = service.NewModerationService(server.db)
	server.gameService = service.NewGameService(server.gameRepo)
	// NOTE: built-in sanctum seeding is intentionally NOT performed here.
	// Seeding should be explicit during runtime bootstrap (cmd) or test setup.

	// Initialize notifier and hub if Redis is available
	if redisClient != nil {
		server.notifier = notifications.NewNotifier(redisClient)

		// Create a single shared ConnectionManager and wire it into both hubs.
		sharedPresence := notifications.NewConnectionManager(redisClient, notifications.ConnectionManagerConfig{})

		server.hub = notifications.NewHub(redisClient)
		// Replace hub's manager with the shared instance
		server.hub.SetPresenceManager(sharedPresence)

		server.chatHub = notifications.NewChatHub(redisClient)
		// Replace chat hub's manager with the shared instance (registers chat handlers)
		server.chatHub.SetPresenceManager(sharedPresence)

		server.gameHub = notifications.NewGameHub(db, server.notifier)
		server.videoChatHub = notifications.NewVideoChatHub()
		server.hubs = []wireableHub{server.hub, server.chatHub, server.gameHub, server.videoChatHub}

		// Register server-level presence listeners (fanout to friend notifications)
		sharedPresence.AddListener(
			func(userID uint) { server.notifyFriendsPresence(userID, "online") },
			func(userID uint) { server.notifyFriendsPresence(userID, "offline") },
		)
	}

	return server, nil
}

// NewServerWithDeps creates a Server using already-initialized dependencies.
// Use this in tests or when a bootstrap layer establishes DB/Redis and optionally
// performs explicit seeding.
func NewServerWithDeps(cfg *config.Config, db *gorm.DB, redisClient *redis.Client) (*Server, error) {
	// Initialize repositories
	userRepo := repository.NewUserRepository(db)
	postRepo := repository.NewPostRepository(db)
	pollRepo := repository.NewPollRepository(db)
	imageRepo := repository.NewImageRepository(db)
	commentRepo := repository.NewCommentRepository(db)
	chatRepo := repository.NewChatRepository(db)
	friendRepo := repository.NewFriendRepository(db)
	gameRepo := repository.NewGameRepository(db)
	streamRepo := repository.NewStreamRepository(db)

	// Initialize Prometheus metrics
	prom := middleware.InitMetrics("sanctum-api")

	// Initialize Logger with correct env
	middleware.InitLogger(cfg.Env)

	server := &Server{
		config:          cfg,
		db:              db,
		redis:           redisClient,
		promMiddleware:  prom,
		userRepo:        userRepo,
		postRepo:        postRepo,
		pollRepo:        pollRepo,
		imageRepo:       imageRepo,
		commentRepo:     commentRepo,
		chatRepo:        chatRepo,
		friendRepo:      friendRepo,
		gameRepo:        gameRepo,
		streamRepo:      streamRepo,
		featureFlags:    featureflags.NewManager(cfg.FeatureFlags),
		consumedTickets: make(map[string]consumedTicketEntry),
	}

	server.postService = service.NewPostService(server.postRepo, server.pollRepo, server.isAdminByUserID)
	server.imageService = service.NewImageService(server.imageRepo, cfg)
	server.commentService = service.NewCommentService(server.commentRepo, server.postRepo, server.isAdminByUserID)
	server.chatService = service.NewChatService(
		server.chatRepo,
		server.userRepo,
		server.db,
		server.isAdminByUserID,
		server.canModerateChatroomByUserID,
	)
	server.userService = service.NewUserService(server.userRepo)
	server.moderationService = service.NewModerationService(server.db)
	server.gameService = service.NewGameService(server.gameRepo)

	// Initialize notifier and hub if Redis is available
	if redisClient != nil {
		server.notifier = notifications.NewNotifier(redisClient)

		// Create a single shared ConnectionManager and wire it into both hubs.
		sharedPresence := notifications.NewConnectionManager(redisClient, notifications.ConnectionManagerConfig{})

		server.hub = notifications.NewHub(redisClient)
		server.hub.SetPresenceManager(sharedPresence)

		server.chatHub = notifications.NewChatHub(redisClient)
		server.chatHub.SetPresenceManager(sharedPresence)

		server.gameHub = notifications.NewGameHub(db, server.notifier)
		server.videoChatHub = notifications.NewVideoChatHub()
		server.hubs = []wireableHub{server.hub, server.chatHub, server.gameHub, server.videoChatHub}

		// Register server-level presence listeners (fanout to friend notifications)
		sharedPresence.AddListener(
			func(userID uint) { server.notifyFriendsPresence(userID, "online") },
			func(userID uint) { server.notifyFriendsPresence(userID, "offline") },
		)
	}

	return server, nil
}

// SetupMiddleware configures middleware for the Fiber app
func (s *Server) SetupMiddleware(app *fiber.App) {
	// Store environment in locals for use in utility functions (like error responses)
	app.Use(func(c *fiber.Ctx) error {
		c.Locals("env", s.config.Env)
		return c.Next()
	})

	// Panic recovery
	app.Use(recover.New())

	// Tracing (OTEL)
	app.Use(middleware.TracingMiddleware())

	// Request ID for tracing
	app.Use(requestid.New())

	// Context Middleware to propagate Request ID and User ID
	app.Use(middleware.ContextMiddleware())

	// Prometheus Metrics
	if s.promMiddleware != nil {
		app.Use(middleware.MetricsMiddleware(s.promMiddleware))
	}

	// Security headers
	app.Use(helmet.New())

	// Structured Logging middleware (after requestid and context middleware)
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

	// Global rate limiting (100 requests per minute per IP); disabled in development/test/stress so workflows are not throttled.
	if s.config.Env != "development" && s.config.Env != "test" && s.config.Env != "stress" {
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
}

// SetupRoutes configures all routes for the application
func (s *Server) SetupRoutes(app *fiber.App) {
	// Development fallback for direct media URLs; production is served by nginx.
	app.Static("/media/i", s.config.ImageUploadDir)

	api := app.Group("/api")

	// Health checks
	app.Get("/health/live", s.LivenessCheck)
	app.Get("/health/ready", s.ReadinessCheck)
	// Backwards-compatible legacy route: map /health to readiness (keeps existing scripts working)
	app.Get("/health", s.ReadinessCheck)
	api.Get("/", s.HealthCheck) // Vibecheck alias

	// Metrics endpoint for Prometheus
	if s.promMiddleware != nil {
		s.promMiddleware.RegisterAt(app, "/metrics")
	}
	api.Get("/metrics/dashboard", monitor.New(monitor.Config{
		Title: "Sanctum Backend Metrics Dashboard",
	}))

	// Swagger documentation
	api.Get("/swagger/*", swagger.HandlerDefault)

	// Auth routes
	auth := api.Group("/auth")
	auth.Post("/signup", middleware.RateLimitWithPolicy(
		s.redis, s.config.Env, 3, 10*time.Minute, middleware.FailClosed, "signup"), s.Signup)
	auth.Post("/login", middleware.RateLimitWithPolicy(
		s.redis, s.config.Env, 10, 5*time.Minute, middleware.FailClosed, "login"), s.Login)
	auth.Post("/refresh", s.Refresh)
	auth.Post("/logout", s.AuthRequired(), s.Logout)

	// Public post routes (browse/search)
	publicPosts := api.Group("/posts")
	publicPosts.Get("/", s.GetPosts)
	publicPosts.Get("/search", middleware.RateLimit(
		s.redis, s.config.Env, 10, time.Minute, "search"), s.SearchPosts)
	publicPosts.Get("/:id/comments", s.GetComments)
	publicPosts.Get("/:id", s.GetPost)
	images := api.Group("/images")
	images.Get("/:hash", s.ServeImage)
	images.Get("/:hash/status", s.GetImageStatus)

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
	sanctumRequests.Delete("/:id", s.DeleteSanctumRequest)
	sanctumAdmins := protected.Group("/sanctums/:slug/admins")
	sanctumAdmins.Get("/", s.GetSanctumAdmins)
	sanctumAdmins.Post("/:userId", s.PromoteSanctumAdmin)
	sanctumAdmins.Delete("/:userId", s.DemoteSanctumAdmin)
	sanctumMemberships := protected.Group("/sanctums/memberships")
	sanctumMemberships.Get("/me", s.GetMySanctumMemberships)
	sanctumMemberships.Post("/bulk", s.UpsertMySanctumMemberships)

	// User routes
	users := protected.Group("/users")
	users.Get("/me", s.GetMyProfile)
	users.Put("/me", s.UpdateMyProfile)
	users.Get("/me/mentions", s.GetMyMentions)
	users.Get("/blocks/me", s.GetMyBlocks)
	users.Get("/", s.GetAllUsers)

	// WebSocket ticket issuance
	api.Post("/ws/ticket", s.AuthRequired(), s.IssueWSTicket)
	protected.Post("/images/upload", s.UploadImage)

	// Define specific /:id/:resource routes BEFORE generic /:id route
	users.Get("/:id/cached", s.GetUserCached)
	users.Get("/:id/posts", s.GetUserPosts)
	users.Post("/:id/promote-admin", s.AdminRequired(), s.PromoteToAdmin)
	users.Post("/:id/demote-admin", s.AdminRequired(), s.DemoteFromAdmin)
	users.Post("/:id/block", s.BlockUser)
	users.Delete("/:id/block", s.UnblockUser)
	users.Post("/:id/report", middleware.RateLimitWithPolicy(s.redis, s.config.Env, 5, 10*time.Minute, middleware.FailClosed, "report"), s.ReportUser)
	users.Get("/:id", s.GetUserProfile)

	// Friend routes
	friends := protected.Group("/friends")
	friends.Get("/", s.GetFriends)
	// Specific /requests routes before generic /:userId
	friends.Post("/requests/:userId", middleware.RateLimit(
		s.redis, s.config.Env, 5, 5*time.Minute, "friend_request"), s.SendFriendRequest)
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
	posts.Post("/", middleware.RateLimit(
		s.redis, s.config.Env, 10, 5*time.Minute, "create_post"), s.CreatePost)
	// Define specific /:id/:resource routes BEFORE generic /:id route
	posts.Post("/:id/like", s.LikePost)
	posts.Delete("/:id/like", s.UnlikePost)
	posts.Post("/:id/comments", middleware.RateLimit(
		s.redis, s.config.Env, 1, time.Minute, "create_comment"), s.CreateComment)
	posts.Put("/:id/comments/:commentId", s.UpdateComment)
	posts.Delete("/:id/comments/:commentId", s.DeleteComment)
	posts.Post("/:id/report", middleware.RateLimitWithPolicy(s.redis, s.config.Env, 5, 10*time.Minute, middleware.FailClosed, "report"), s.ReportPost)
	posts.Post("/:id/poll/vote", s.VotePoll)
	// Generic /:id routes (for item detail, update, delete)
	posts.Put("/:id", s.UpdatePost)
	posts.Delete("/:id", s.DeletePost)

	// Chat routes
	conversations := protected.Group("/conversations")
	conversations.Post("/", s.CreateConversation)
	conversations.Get("/", s.GetConversations)
	// Define specific /:id/:resource routes BEFORE generic /:id route
	conversations.Get("/:id/messages", s.GetMessages)
	conversations.Post("/:id/messages", middleware.RateLimit(
		s.redis, s.config.Env, 15, time.Minute, "send_chat"), s.SendMessage)
	conversations.Post("/:id/read", s.MarkConversationRead)
	conversations.Post("/:id/messages/:messageId/reactions", s.AddMessageReaction)
	conversations.Delete("/:id/messages/:messageId/reactions", s.RemoveMessageReaction)
	conversations.Post("/:id/messages/:messageId/report", middleware.RateLimitWithPolicy(s.redis, s.config.Env, 5, 10*time.Minute, middleware.FailClosed, "report"), s.ReportMessage)
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
	chatrooms.Get("/:id/mutes", s.ListChatroomMutes)
	chatrooms.Post("/:id/mutes/:userId", s.MuteChatroomUser)
	chatrooms.Delete("/:id/mutes/:userId", s.UnmuteChatroomUser)
	chatrooms.Get("/:id/moderators", s.GetChatroomModerators)
	chatrooms.Post("/:id/moderators/:userId", s.AddChatroomModerator)
	chatrooms.Delete("/:id/moderators/:userId", s.RemoveChatroomModerator)

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
	streams.Post("/:id/messages", middleware.RateLimit(s.redis, s.config.Env, 30, time.Minute, "stream_chat"), s.SendStreamMessage)

	// Websocket endpoints - protected by AuthRequired
	ws := api.Group("/ws", s.AuthRequired())
	ws.Get("/", s.WebsocketHandler())                   // General notifications
	ws.Get("/chat", s.WebSocketChatHandler())           // Real-time chat
	ws.Get("/game", s.WebSocketGameHandler())           // Multiplayer games
	ws.Get("/videochat", s.WebSocketVideoChatHandler()) // WebRTC video chat signaling

	// Admin routes
	admin := protected.Group("/admin", s.AdminRequired())
	admin.Delete("/sanctums/:slug", s.DeleteSanctum)
	admin.Get("/feature-flags", middleware.RateLimitWithPolicy(s.redis, s.config.Env, 30, time.Minute, middleware.FailClosed, "admin_read"), s.GetFeatureFlags)
	admin.Get("/reports", middleware.RateLimitWithPolicy(s.redis, s.config.Env, 30, time.Minute, middleware.FailClosed, "admin_read"), s.GetAdminReports)
	admin.Post("/reports/:id/resolve", middleware.RateLimitWithPolicy(s.redis, s.config.Env, 10, 5*time.Minute, middleware.FailClosed, "admin_write"), s.ResolveAdminReport)
	admin.Get("/ban-requests", middleware.RateLimitWithPolicy(s.redis, s.config.Env, 30, time.Minute, middleware.FailClosed, "admin_read"), s.GetAdminBanRequests)
	admin.Get("/users", middleware.RateLimitWithPolicy(s.redis, s.config.Env, 30, time.Minute, middleware.FailClosed, "admin_read"), s.GetAdminUsers)
	admin.Get("/users/:id", middleware.RateLimitWithPolicy(s.redis, s.config.Env, 30, time.Minute, middleware.FailClosed, "admin_read"), s.GetAdminUserDetail)
	admin.Post("/users/:id/ban", middleware.RateLimitWithPolicy(s.redis, s.config.Env, 10, 5*time.Minute, middleware.FailClosed, "admin_write"), s.BanUser)
	admin.Post("/users/:id/unban", middleware.RateLimitWithPolicy(s.redis, s.config.Env, 10, 5*time.Minute, middleware.FailClosed, "admin_write"), s.UnbanUser)
	adminSanctumRequests := admin.Group("/sanctum-requests")
	adminSanctumRequests.Get("/", middleware.RateLimitWithPolicy(s.redis, s.config.Env, 30, time.Minute, middleware.FailClosed, "admin_read"), s.GetAdminSanctumRequests)
	adminSanctumRequests.Post("/:id/approve", middleware.RateLimitWithPolicy(s.redis, s.config.Env, 10, 5*time.Minute, middleware.FailClosed, "admin_write"), s.ApproveSanctumRequest)
	adminSanctumRequests.Post("/:id/reject", middleware.RateLimitWithPolicy(s.redis, s.config.Env, 10, 5*time.Minute, middleware.FailClosed, "admin_write"), s.RejectSanctumRequest)
}

// HealthCheck is a legacy/simple alias for ReadinessCheck
func (s *Server) HealthCheck(c *fiber.Ctx) error {
	return s.ReadinessCheck(c)
}

// LivenessCheck handles liveness probe requests
func (s *Server) LivenessCheck(c *fiber.Ctx) error {
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"status": "up",
		"time":   time.Now(),
	})
}

// ReadinessCheck handles readiness probe requests
func (s *Server) ReadinessCheck(c *fiber.Ctx) error {
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
		// Redis is considered required for full readiness in this app
		redisStatus = "unavailable"
	}

	status := fiber.StatusOK
	overallStatus := "healthy"
	if dbStatus == "unhealthy" || redisStatus != "healthy" {
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
		path := c.Path()
		isWSPath := strings.HasPrefix(path, "/api/ws")

		// 1. Try WebSocket ticket first (short-lived, single-use)
		ticket := c.Query("ticket")
		if ticket != "" && s.redis != nil {
			key := fmt.Sprintf("ws_ticket:%s", ticket)

			var userID uint
			var ticketValid bool

			// Always use atomic GETDEL to prevent replay attacks.
			userIDStr, err := s.redis.GetDel(c.Context(), key).Result()
			if err == nil {
				parsed, parseErr := strconv.ParseUint(userIDStr, 10, 32)
				if parseErr == nil {
					userID = uint(parsed)
					ticketValid = true
					log.Printf("[WS Auth] Ticket validated from Redis for user %d, path=%s", userID, path)
					// Cache the consumed ticket in-process for 10s to allow
					// Fiber's websocket upgrade multi-pass handshake to succeed.
					s.consumedTicketsMu.Lock()
					if s.consumedTickets != nil {
						s.consumedTickets[ticket] = consumedTicketEntry{userID: userID, consumeAt: time.Now()}
					}
					s.consumedTicketsMu.Unlock()
				} else {
					log.Printf("[WS Auth] Ticket found in Redis but userID parse failed: %v, path=%s", parseErr, path)
				}
			} else if s.consumedTickets != nil {
				// Ticket not in Redis -- check in-process cache for multi-pass handshake
				s.consumedTicketsMu.Lock()
				if entry, ok := s.consumedTickets[ticket]; ok && time.Since(entry.consumeAt) < 10*time.Second {
					userID = entry.userID
					ticketValid = true
					log.Printf("[WS Auth] Ticket validated from in-process cache for user %d (multi-pass handshake), path=%s", userID, path)
				}
				s.consumedTicketsMu.Unlock()
			}

			if ticketValid {
				c.Locals("userID", userID)
				c.Locals("wsTicket", ticket)
				ctx := context.WithValue(c.UserContext(), middleware.UserIDKey, userID)
				c.SetUserContext(ctx)
				banned, berr := s.isBannedByUserID(c.UserContext(), userID)
				if berr != nil {
					return models.RespondWithError(c, fiber.StatusInternalServerError, berr)
				}
				if banned {
					return models.RespondWithError(c, fiber.StatusForbidden,
						models.NewForbiddenError("Account is banned"))
				}
				return c.Next()
			}
			// If ticket was provided but invalid/expired, we fail if it's a WS path
			if isWSPath {
				log.Printf("[WS Auth] Invalid or expired ticket for WebSocket path=%s", path)
				return models.RespondWithError(c, fiber.StatusUnauthorized,
					models.NewUnauthorizedError("Invalid or expired WebSocket ticket"))
			}
		}

		// 2. Fall back to JWT (Bearer token or query param)
		authHeader := c.Get("Authorization")
		tokenString := ""
		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) == 2 && parts[0] == "Bearer" {
				tokenString = parts[1]
			}
		}

		// Reject token in query param for WS routes (must use ticket)
		if tokenString == "" && !isWSPath {
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

		// Check JTI for revocation
		if jti, exists := claims["jti"].(string); exists && jti != "" {
			if s.redis != nil {
				isBlacklisted, err := s.redis.Exists(c.Context(), "blacklist:"+jti).Result()
				if err == nil && isBlacklisted > 0 {
					return models.RespondWithError(c, fiber.StatusUnauthorized,
						models.NewUnauthorizedError("Token has been revoked"))
				}
			}
		}

		// Store user ID in context
		c.Locals("userID", uint(userID))
		// Sync to UserContext for logging and downstream services
		ctx := context.WithValue(c.UserContext(), middleware.UserIDKey, uint(userID))
		c.SetUserContext(ctx)
		banned, berr := s.isBannedByUserID(c.UserContext(), uint(userID))
		if berr != nil {
			return models.RespondWithError(c, fiber.StatusInternalServerError, berr)
		}
		if banned {
			return models.RespondWithError(c, fiber.StatusForbidden,
				models.NewForbiddenError("Account is banned"))
		}

		return c.Next()
	}
}

// consumeWSTicket removes the ticket from the in-process cache after the
// WebSocket connection is fully established. The ticket was already atomically
// removed from Redis by GETDEL during auth.
func (s *Server) consumeWSTicket(_ context.Context, ticketVal any) {
	if ticketVal == nil {
		return
	}
	ticket, ok := ticketVal.(string)
	if !ok || ticket == "" {
		return
	}
	s.consumedTicketsMu.Lock()
	delete(s.consumedTickets, ticket)
	s.consumedTicketsMu.Unlock()
}

// cleanupConsumedTickets periodically removes stale entries from the in-process
// consumed ticket cache. Called from Start().
func (s *Server) cleanupConsumedTickets(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.consumedTicketsMu.Lock()
			now := time.Now()
			for k, v := range s.consumedTickets {
				if now.Sub(v.consumeAt) > 15*time.Second {
					delete(s.consumedTickets, k)
				}
			}
			s.consumedTicketsMu.Unlock()
		}
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
			// Default status code
			code := fiber.StatusInternalServerError

			// If it's a fiber.Error, use its status code
			var e *fiber.Error
			if errors.As(err, &e) {
				code = e.Code
			}

			// Log the error
			log.Printf("Error [%d]: %v", code, err)

			return models.RespondWithError(c, code, err)
		},
	})
	s.app = app

	s.SetupMiddleware(app)
	s.SetupRoutes(app)
	s.imageSvc().StartBackgroundWorker(s.shutdownCtx)

	// Start consumed ticket cache cleanup
	go s.cleanupConsumedTickets(s.shutdownCtx)

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
	// Ensure image upload dir exists in development to reduce 404s for /media/*
	if dir := s.config.ImageUploadDir; dir != "" {
		if _, err := os.Stat(dir); err != nil {
			if os.IsNotExist(err) {
				if s.config.Env == "development" || s.config.Env == "dev" || s.config.Env == "" {
					if mkErr := os.MkdirAll(dir, 0o750); mkErr != nil {
						log.Printf("WARNING: failed to create image upload dir %s: %v", dir, mkErr)
					} else {
						log.Printf("Created image upload dir for development: %s", dir)
					}
				} else {
					log.Printf("WARNING: image upload dir %s does not exist - media requests may 404. Create it or set IMAGE_UPLOAD_DIR accordingly.", dir)
				}
			} else {
				log.Printf("WARNING: unable to stat image upload dir %s: %v", dir, err)
			}
		}
	}
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
