package server

import (
	"fmt"
	"strconv"
	"time"
	"vibeshift/models"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

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
