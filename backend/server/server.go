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
	"vibeshift/models"
	"vibeshift/repository"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// Server holds all dependencies and provides handlers
type Server struct {
	config   *config.Config
	db       *gorm.DB
	redis    *redis.Client
	userRepo repository.UserRepository
	postRepo repository.PostRepository
	chatRepo repository.ChatRepository
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
	chatRepo := repository.NewChatRepository(db)

	server := &Server{
		config:   cfg,
		db:       db,
		redis:    redisClient,
		userRepo: userRepo,
		postRepo: postRepo,
		chatRepo: chatRepo,
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

	// Auth routes
	auth := api.Group("/auth")
	auth.Post("/signup", s.Signup)
	auth.Post("/login", s.Login)

	// Protected routes
	protected := api.Group("", s.AuthRequired())

	// User routes
	users := protected.Group("/users")
	users.Get("/me", s.GetMyProfile)
	users.Put("/me", s.UpdateMyProfile)
	users.Get("/", s.GetAllUsers)
	users.Get("/:id", s.GetUserProfile)
	users.Get("/:id/posts", s.GetUserPosts)

	// Post routes
	posts := protected.Group("/posts")
	posts.Post("/", s.CreatePost)
	posts.Get("/", s.GetPosts)
	posts.Get("/:id", s.GetPost)
	posts.Put("/:id", s.UpdatePost)
	posts.Delete("/:id", s.DeletePost)
	posts.Post("/:id/like", s.LikePost)
	posts.Delete("/:id/like", s.UnlikePost)

	// Chat routes
	conversations := protected.Group("/conversations")
	conversations.Post("/", s.CreateConversation)
	conversations.Get("/", s.GetConversations)
	conversations.Get("/:id", s.GetConversation)
	conversations.Post("/:id/messages", s.SendMessage)
	conversations.Get("/:id/messages", s.GetMessages)
	conversations.Post("/:id/participants", s.AddParticipant)
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
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
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

// Signup handles POST /api/auth/signup
func (s *Server) Signup(c *fiber.Ctx) error {
	var req struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.BodyParser(&req); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	// Validate input
	if req.Username == "" || req.Email == "" || req.Password == "" {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Username, email, and password are required"))
	}

	// Check if user already exists
	existing, err := s.userRepo.GetByEmail(c.Context(), req.Email)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}
	if existing != nil {
		return models.RespondWithError(c, fiber.StatusConflict,
			models.NewValidationError("User already exists"))
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError,
			models.NewInternalError(err))
	}

	// Create user
	user := &models.User{
		Username: req.Username,
		Email:    req.Email,
		Password: string(hashedPassword),
	}

	if err := s.userRepo.Create(c.Context(), user); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	// Generate JWT token
	token, err := s.generateToken(user.ID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError,
			models.NewInternalError(err))
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"token": token,
		"user":  user,
	})
}

// Login handles POST /api/auth/login
func (s *Server) Login(c *fiber.Ctx) error {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.BodyParser(&req); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	// Find user by email
	user, err := s.userRepo.GetByEmail(c.Context(), req.Email)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}
	if user == nil {
		return models.RespondWithError(c, fiber.StatusUnauthorized,
			models.NewUnauthorizedError("Invalid credentials"))
	}

	// Compare password
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		return models.RespondWithError(c, fiber.StatusUnauthorized,
			models.NewUnauthorizedError("Invalid credentials"))
	}

	// Generate JWT token
	token, err := s.generateToken(user.ID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError,
			models.NewInternalError(err))
	}

	return c.JSON(fiber.Map{
		"token": token,
		"user":  user,
	})
}

// generateToken creates a JWT token for the given user ID
func (s *Server) generateToken(userID uint) (string, error) {
	// Validate secret exists
	if s.config.JWTSecret == "" {
		return "", fmt.Errorf("JWT secret not configured")
	}

	now := time.Now()
	claims := jwt.MapClaims{
		"sub": strconv.FormatUint(uint64(userID), 10), // Subject (user ID as string)
		"iss": "vibeshift-api",                        // Issuer
		"aud": "vibeshift-client",                     // Audience
		"exp": now.Add(time.Hour * 24 * 7).Unix(),     // Expiration (7 days)
		"iat": now.Unix(),                             // Issued at
		"nbf": now.Unix(),                             // Not before
		"jti": s.generateJTI(),                        // JWT ID (unique identifier)
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.config.JWTSecret))
}

// generateJTI creates a unique JWT ID to prevent replay attacks
func (s *Server) generateJTI() string {
	return fmt.Sprintf("%d-%s", time.Now().Unix(), uuid.New().String()[:8])
}
func (s *Server) GetAllUsers(c *fiber.Ctx) error {
	ctx := c.Context()
	limit := c.QueryInt("limit", 100)
	offset := c.QueryInt("offset", 0)

	users, err := s.userRepo.List(ctx, limit, offset)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	// Hide passwords
	for i := range users {
		users[i].Password = ""
	}

	return c.JSON(users)
}

// GetUserProfile handles GET /api/users/:id
func (s *Server) GetUserProfile(c *fiber.Ctx) error {
	ctx := c.Context()
	id, err := c.ParamsInt("id")
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid user ID"))
	}

	user, err := s.userRepo.GetByID(ctx, uint(id))
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	// Hide password
	user.Password = ""
	return c.JSON(user)
}

// GetMyProfile handles GET /api/users/me
func (s *Server) GetMyProfile(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)

	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	// Hide password
	user.Password = ""
	return c.JSON(user)
}

// UpdateMyProfile handles PUT /api/users/me
func (s *Server) UpdateMyProfile(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)

	var req struct {
		Username string `json:"username"`
		Bio      string `json:"bio"`
		Avatar   string `json:"avatar"`
	}
	if err := c.BodyParser(&req); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	// Get current user
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	// Update fields if provided
	if req.Username != "" {
		user.Username = req.Username
	}
	if req.Bio != "" {
		user.Bio = req.Bio
	}
	if req.Avatar != "" {
		user.Avatar = req.Avatar
	}

	// Save updated user
	if err := s.userRepo.Update(ctx, user); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	// Hide password before returning
	user.Password = ""
	return c.JSON(user)
}

// Post Handlers

// CreatePost handles POST /api/posts
func (s *Server) CreatePost(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)

	var req struct {
		Title    string `json:"title"`
		Content  string `json:"content"`
		ImageURL string `json:"image_url,omitempty"`
	}
	if err := c.BodyParser(&req); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	// Validate required fields
	if req.Title == "" || req.Content == "" {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Title and content are required"))
	}

	post := &models.Post{
		Title:    req.Title,
		Content:  req.Content,
		ImageURL: req.ImageURL,
		UserID:   userID,
	}

	if err := s.postRepo.Create(ctx, post); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	// Load user data for response
	post, err := s.postRepo.GetByID(ctx, post.ID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.Status(fiber.StatusCreated).JSON(post)
}

// GetPosts handles GET /api/posts
func (s *Server) GetPosts(c *fiber.Ctx) error {
	ctx := c.Context()
	limit := c.QueryInt("limit", 20)
	offset := c.QueryInt("offset", 0)

	posts, err := s.postRepo.List(ctx, limit, offset)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(posts)
}

// GetPost handles GET /api/posts/:id
func (s *Server) GetPost(c *fiber.Ctx) error {
	ctx := c.Context()
	id, err := c.ParamsInt("id")
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid post ID"))
	}

	post, err := s.postRepo.GetByID(ctx, uint(id))
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	return c.JSON(post)
}

// GetUserPosts handles GET /api/users/:id/posts
func (s *Server) GetUserPosts(c *fiber.Ctx) error {
	ctx := c.Context()
	userIDParam, err := c.ParamsInt("id")
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid user ID"))
	}

	limit := c.QueryInt("limit", 20)
	offset := c.QueryInt("offset", 0)

	posts, err := s.postRepo.GetByUserID(ctx, uint(userIDParam), limit, offset)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(posts)
}

// UpdatePost handles PUT /api/posts/:id
func (s *Server) UpdatePost(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	postID, err := c.ParamsInt("id")
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid post ID"))
	}

	var req struct {
		Title    string `json:"title"`
		Content  string `json:"content"`
		ImageURL string `json:"image_url,omitempty"`
	}
	if err := c.BodyParser(&req); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	// Get existing post
	post, err := s.postRepo.GetByID(ctx, uint(postID))
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	// Check ownership
	if post.UserID != userID {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("You can only update your own posts"))
	}

	// Update fields if provided
	if req.Title != "" {
		post.Title = req.Title
	}
	if req.Content != "" {
		post.Content = req.Content
	}
	if req.ImageURL != "" {
		post.ImageURL = req.ImageURL
	}

	if err := s.postRepo.Update(ctx, post); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(post)
}

// DeletePost handles DELETE /api/posts/:id
func (s *Server) DeletePost(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	postID, err := c.ParamsInt("id")
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid post ID"))
	}

	// Get existing post to check ownership
	post, err := s.postRepo.GetByID(ctx, uint(postID))
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	// Check ownership
	if post.UserID != userID {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("You can only delete your own posts"))
	}

	if err := s.postRepo.Delete(ctx, uint(postID)); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.SendStatus(fiber.StatusNoContent)
}

// LikePost handles POST /api/posts/:id/like
func (s *Server) LikePost(c *fiber.Ctx) error {
	ctx := c.Context()
	postID, err := c.ParamsInt("id")
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid post ID"))
	}

	if err := s.postRepo.Like(ctx, uint(postID)); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.SendStatus(fiber.StatusOK)
}

// UnlikePost handles DELETE /api/posts/:id/like
func (s *Server) UnlikePost(c *fiber.Ctx) error {
	ctx := c.Context()
	postID, err := c.ParamsInt("id")
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid post ID"))
	}

	if err := s.postRepo.Unlike(ctx, uint(postID)); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.SendStatus(fiber.StatusOK)
}

// Chat Handlers

// CreateConversation handles POST /api/conversations
func (s *Server) CreateConversation(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)

	var req struct {
		Name           string `json:"name,omitempty"`
		IsGroup        bool   `json:"is_group,omitempty"`
		ParticipantIDs []uint `json:"participant_ids"`
	}
	if err := c.BodyParser(&req); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	// For group chats, name is required
	if req.IsGroup && req.Name == "" {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Group conversations require a name"))
	}

	// Must have at least one participant besides creator
	if len(req.ParticipantIDs) == 0 {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("At least one participant is required"))
	}

	conv := &models.Conversation{
		Name:      req.Name,
		IsGroup:   req.IsGroup,
		CreatedBy: userID,
	}

	if err := s.chatRepo.CreateConversation(ctx, conv); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	// Add creator as participant
	if err := s.chatRepo.AddParticipant(ctx, conv.ID, userID); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	// Add other participants
	for _, participantID := range req.ParticipantIDs {
		if err := s.chatRepo.AddParticipant(ctx, conv.ID, participantID); err != nil {
			return models.RespondWithError(c, fiber.StatusInternalServerError, err)
		}
	}

	// Load full conversation for response
	conv, err := s.chatRepo.GetConversation(ctx, conv.ID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.Status(fiber.StatusCreated).JSON(conv)
}

// GetConversations handles GET /api/conversations
func (s *Server) GetConversations(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)

	conversations, err := s.chatRepo.GetUserConversations(ctx, userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(conversations)
}

// GetConversation handles GET /api/conversations/:id
func (s *Server) GetConversation(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	convID, err := c.ParamsInt("id")
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid conversation ID"))
	}

	conv, err := s.chatRepo.GetConversation(ctx, uint(convID))
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	// Check if user is participant
	isParticipant := false
	for _, participant := range conv.Participants {
		if participant.ID == userID {
			isParticipant = true
			break
		}
	}

	if !isParticipant {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("You are not a participant in this conversation"))
	}

	return c.JSON(conv)
}

// SendMessage handles POST /api/conversations/:id/messages
func (s *Server) SendMessage(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	convID, err := c.ParamsInt("id")
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid conversation ID"))
	}

	var req struct {
		Content     string `json:"content"`
		MessageType string `json:"message_type,omitempty"`
		Metadata    string `json:"metadata,omitempty"`
	}
	if err := c.BodyParser(&req); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	if req.Content == "" {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Message content is required"))
	}

	if req.MessageType == "" {
		req.MessageType = "text"
	}

	// Check if user is participant in conversation
	conv, err := s.chatRepo.GetConversation(ctx, uint(convID))
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	isParticipant := false
	for _, participant := range conv.Participants {
		if participant.ID == userID {
			isParticipant = true
			break
		}
	}

	if !isParticipant {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("You are not a participant in this conversation"))
	}

	message := &models.Message{
		ConversationID: uint(convID),
		SenderID:       userID,
		Content:        req.Content,
		MessageType:    req.MessageType,
		Metadata:       req.Metadata,
	}

	if err := s.chatRepo.CreateMessage(ctx, message); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	// Load message with sender info for response
	// For simplicity, we'll return the message as created
	return c.Status(fiber.StatusCreated).JSON(message)
}

// GetMessages handles GET /api/conversations/:id/messages
func (s *Server) GetMessages(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	convID, err := c.ParamsInt("id")
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid conversation ID"))
	}

	limit := c.QueryInt("limit", 50)
	offset := c.QueryInt("offset", 0)

	// Check if user is participant
	conv, err := s.chatRepo.GetConversation(ctx, uint(convID))
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	isParticipant := false
	for _, participant := range conv.Participants {
		if participant.ID == userID {
			isParticipant = true
			break
		}
	}

	if !isParticipant {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("You are not a participant in this conversation"))
	}

	messages, err := s.chatRepo.GetMessages(ctx, uint(convID), limit, offset)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(messages)
}

// AddParticipant handles POST /api/conversations/:id/participants
func (s *Server) AddParticipant(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	convID, err := c.ParamsInt("id")
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid conversation ID"))
	}

	var req struct {
		UserID uint `json:"user_id"`
	}
	if err := c.BodyParser(&req); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	// Check if current user is participant and conversation is group
	conv, err := s.chatRepo.GetConversation(ctx, uint(convID))
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	isParticipant := false
	for _, participant := range conv.Participants {
		if participant.ID == userID {
			isParticipant = true
			break
		}
	}

	if !isParticipant {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("You are not a participant in this conversation"))
	}

	if !conv.IsGroup {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Cannot add participants to 1-on-1 conversations"))
	}

	if err := s.chatRepo.AddParticipant(ctx, uint(convID), req.UserID); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.SendStatus(fiber.StatusOK)
}
