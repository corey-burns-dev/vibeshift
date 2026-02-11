// Package server contains HTTP and WebSocket handlers for the application's API endpoints.
package server

import (
	"fmt"
	"strconv"
	"time"

	"sanctum/internal/models"
	"sanctum/internal/validation"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// Signup handles POST /api/auth/signup
// @Summary User signup
// @Description Register a new user account
// @Tags auth
// @Accept json
// @Produce json
// @Param request body object{username=string,email=string,password=string} true "Signup request"
// @Success 201 {object} object{token=string,user=models.User}
// @Failure 400 {object} object{error=string}
// @Failure 409 {object} object{error=string}
// @Router /auth/signup [post]
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

	// Validate username format
	if err := validation.ValidateUsername(req.Username); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError(err.Error()))
	}

	// Validate email format
	if err := validation.ValidateEmail(req.Email); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError(err.Error()))
	}

	// Validate password strength
	if err := validation.ValidatePassword(req.Password); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError(err.Error()))
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

	if createErr := s.userRepo.Create(c.Context(), user); createErr != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, createErr)
	}

	// Generate JWT token
	token, err := s.generateToken(user.ID, user.Username)
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
// @Summary User login
// @Description Authenticate user and return JWT token
// @Tags auth
// @Accept json
// @Produce json
// @Param request body object{email=string,password=string} true "Login credentials"
// @Success 200 {object} object{token=string,user=models.User}
// @Failure 400 {object} object{error=string}
// @Failure 401 {object} object{error=string}
// @Router /auth/login [post]
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
	if cmpErr := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); cmpErr != nil {
		return models.RespondWithError(c, fiber.StatusUnauthorized,
			models.NewUnauthorizedError("Invalid credentials"))
	}

	// Generate JWT token
	token, err := s.generateToken(user.ID, user.Username)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError,
			models.NewInternalError(err))
	}

	return c.JSON(fiber.Map{
		"token": token,
		"user":  user,
	})
}

// generateToken creates a JWT token for the given user ID and username
func (s *Server) generateToken(userID uint, username string) (string, error) {
	// Validate secret exists
	if s.config.JWTSecret == "" {
		return "", fmt.Errorf("JWT secret not configured")
	}

	now := time.Now()
	claims := jwt.MapClaims{
		"sub":      strconv.FormatUint(uint64(userID), 10), // Subject (user ID as string)
		"username": username,                               // Username (cached in token)
		"iss":      "sanctum-api",                          // Issuer
		"aud":      "sanctum-client",                       // Audience
		"exp":      now.Add(time.Hour * 24 * 7).Unix(),     // Expiration (7 days)
		"iat":      now.Unix(),                             // Issued at
		"nbf":      now.Unix(),                             // Not before
		"jti":      s.generateJTI(),                        // JWT ID (unique identifier)
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.config.JWTSecret))
}

// generateJTI creates a unique JWT ID to prevent replay attacks
func (s *Server) generateJTI() string {
	return fmt.Sprintf("%d-%s", time.Now().Unix(), uuid.New().String()[:8])
}
