// Package server contains HTTP and WebSocket handlers for the application's API endpoints.
package server

import (
	"context"
	"fmt"
	"strconv"
	"strings"
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
// @Success 201 {object} object{token=string,refresh_token=string,user=models.User}
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

	// Generate tokens
	accessToken, err := s.generateAccessToken(user.ID, user.Username)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError,
			models.NewInternalError(err))
	}

	refreshToken, err := s.generateRefreshToken(user.ID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError,
			models.NewInternalError(err))
	}

	s.setRefreshTokenCookie(c, refreshToken)

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"token":         accessToken,
		"refresh_token": refreshToken,
		"user":          user,
	})
}

func (s *Server) setRefreshTokenCookie(c *fiber.Ctx, token string) {
	c.Cookie(&fiber.Cookie{
		Name:     "refresh_token",
		Value:    token,
		Expires:  time.Now().Add(7 * 24 * time.Hour),
		HTTPOnly: true,
		Secure:   s.config.Env == "production" || s.config.Env == "prod",
		SameSite: "Lax",
		Path:     "/api/auth",
	})
}

// Login handles POST /api/auth/login
// @Summary User login
// @Description Authenticate user and return JWT tokens
// @Tags auth
// @Accept json
// @Produce json
// @Param request body object{email=string,password=string} true "Login credentials"
// @Success 200 {object} object{token=string,refresh_token=string,user=models.User}
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

	// Generate tokens
	accessToken, err := s.generateAccessToken(user.ID, user.Username)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError,
			models.NewInternalError(err))
	}

	refreshToken, err := s.generateRefreshToken(user.ID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError,
			models.NewInternalError(err))
	}

	s.setRefreshTokenCookie(c, refreshToken)

	return c.JSON(fiber.Map{
		"token":         accessToken,
		"refresh_token": refreshToken,
		"user":          user,
	})
}

// Refresh handles POST /api/auth/refresh
// @Summary Refresh JWT token
// @Description Get a new access token using a refresh token
// @Tags auth
// @Accept json
// @Produce json
// @Param request body object{refresh_token=string} true "Refresh request"
// @Success 200 {object} object{token=string,refresh_token=string}
// @Failure 401 {object} object{error=string}
// @Router /auth/refresh [post]
func (s *Server) Refresh(c *fiber.Ctx) error {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := c.BodyParser(&req); err != nil {
		// Ignore parser error if it's just an empty body, we'll check cookie
	}

	refreshTokenString := req.RefreshToken
	if refreshTokenString == "" {
		refreshTokenString = c.Cookies("refresh_token")
	}

	if refreshTokenString == "" {
		return models.RespondWithError(c, fiber.StatusUnauthorized,
			models.NewUnauthorizedError("Refresh token required"))
	}

	// Parse and validate refresh token
	token, err := jwt.Parse(refreshTokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(s.config.JWTSecret), nil
	})

	if err != nil || !token.Valid {
		return models.RespondWithError(c, fiber.StatusUnauthorized,
			models.NewUnauthorizedError("Invalid or expired refresh token"))
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return models.RespondWithError(c, fiber.StatusUnauthorized,
			models.NewUnauthorizedError("Invalid token claims"))
	}

	// Check if it's a refresh token
	if aud, ok := claims["aud"].(string); !ok || aud != "sanctum-refresh" {
		return models.RespondWithError(c, fiber.StatusUnauthorized,
			models.NewUnauthorizedError("Invalid token type"))
	}

	// Extract user ID
	sub, ok := claims["sub"].(string)
	if !ok {
		return models.RespondWithError(c, fiber.StatusUnauthorized,
			models.NewUnauthorizedError("Invalid subject claim"))
	}

	userID64, err := strconv.ParseUint(sub, 10, 32)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusUnauthorized,
			models.NewUnauthorizedError("Invalid user ID in token"))
	}
	userID := uint(userID64)

	// Check JTI in Redis (revocation check)
	jti, ok := claims["jti"].(string)
	if !ok {
		return models.RespondWithError(c, fiber.StatusUnauthorized,
			models.NewUnauthorizedError("Invalid JTI claim"))
	}

	if s.redis != nil {
		redisKey := fmt.Sprintf("refresh_token:%d:%s", userID, jti)
		exists, err := s.redis.Exists(c.Context(), redisKey).Result()
		if err != nil {
			return models.RespondWithError(c, fiber.StatusInternalServerError,
				models.NewInternalError(err))
		}
		if exists == 0 {
			return models.RespondWithError(c, fiber.StatusUnauthorized,
				models.NewUnauthorizedError("Refresh token revoked or already used"))
		}

		// Refresh token rotation: Revoke current one
		s.redis.Del(c.Context(), redisKey)
	}

	// Get user to ensure they still exist and get username
	user, err := s.userRepo.GetByID(c.Context(), userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}
	if user == nil {
		return models.RespondWithError(c, fiber.StatusUnauthorized,
			models.NewUnauthorizedError("User no longer exists"))
	}

	// Generate new tokens
	newAccessToken, err := s.generateAccessToken(user.ID, user.Username)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError,
			models.NewInternalError(err))
	}

	newRefreshToken, err := s.generateRefreshToken(user.ID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError,
			models.NewInternalError(err))
	}

	s.setRefreshTokenCookie(c, newRefreshToken)

	return c.JSON(fiber.Map{
		"token":         newAccessToken,
		"refresh_token": newRefreshToken,
	})
}

// Logout handles POST /api/auth/logout
// @Summary User logout
// @Description Revoke refresh token and blacklist current access token
// @Tags auth
// @Accept json
// @Produce json
// @Param request body object{refresh_token=string} true "Logout request"
// @Success 200 {object} object{message=string}
// @Router /auth/logout [post]
func (s *Server) Logout(c *fiber.Ctx) error {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := c.BodyParser(&req); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	// Blacklist the access token if provided in Authorization header
	authHeader := c.Get("Authorization")
	if authHeader != "" {
		parts := strings.Split(authHeader, " ")
		if len(parts) == 2 && parts[0] == "Bearer" {
			accessToken := parts[1]
			token, err := jwt.Parse(accessToken, func(token *jwt.Token) (interface{}, error) {
				return []byte(s.config.JWTSecret), nil
			})
			if err == nil && token.Valid {
				if claims, ok := token.Claims.(jwt.MapClaims); ok {
					if jti, ok := claims["jti"].(string); ok && s.redis != nil {
						// Extract expiration to set TTL for blacklist
						if exp, ok := claims["exp"].(float64); ok {
							ttl := time.Until(time.Unix(int64(exp), 0))
							if ttl > 0 {
								s.redis.Set(c.Context(), "blacklist:"+jti, "1", ttl)
							}
						}
					}
				}
			}
		}
	}

	if req.RefreshToken == "" {
		req.RefreshToken = c.Cookies("refresh_token")
	}

	// Clear the refresh token cookie
	c.ClearCookie("refresh_token")

	if req.RefreshToken == "" {
		return c.JSON(fiber.Map{"message": "Logged out successfully"})
	}

	// Parse token to get JTI and userID
	token, err := jwt.Parse(req.RefreshToken, func(token *jwt.Token) (interface{}, error) {
		return []byte(s.config.JWTSecret), nil
	})

	if err == nil && token.Valid {
		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			sub, _ := claims["sub"].(string)
			jti, _ := claims["jti"].(string)
			userID, _ := strconv.ParseUint(sub, 10, 32)

			if s.redis != nil && jti != "" {
				redisKey := fmt.Sprintf("refresh_token:%d:%s", userID, jti)
				s.redis.Del(c.Context(), redisKey)
			}
		}
	}

	return c.JSON(fiber.Map{"message": "Logged out successfully"})
}

// generateAccessToken creates a short-lived JWT token for the given user ID and username
func (s *Server) generateAccessToken(userID uint, username string) (string, error) {
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
		"exp":      now.Add(15 * time.Minute).Unix(),       // Expiration (15 minutes)
		"iat":      now.Unix(),                             // Issued at
		"nbf":      now.Unix(),                             // Not before
		"jti":      s.generateJTI(),                        // JWT ID (unique identifier)
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.config.JWTSecret))
}

// generateRefreshToken creates a long-lived JWT token for the given user ID
func (s *Server) generateRefreshToken(userID uint) (string, error) {
	if s.config.JWTSecret == "" {
		return "", fmt.Errorf("JWT secret not configured")
	}

	now := time.Now()
	jti := s.generateJTI()
	expiresAt := now.Add(7 * 24 * time.Hour)

	claims := jwt.MapClaims{
		"sub": strconv.FormatUint(uint64(userID), 10),
		"iss": "sanctum-api",
		"aud": "sanctum-refresh",
		"exp": expiresAt.Unix(),
		"iat": now.Unix(),
		"jti": jti,
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signedToken, err := token.SignedString([]byte(s.config.JWTSecret))
	if err != nil {
		return "", err
	}

	// Store JTI in Redis
	if s.redis != nil {
		redisKey := fmt.Sprintf("refresh_token:%d:%s", userID, jti)
		err = s.redis.Set(context.Background(), redisKey, "1", 7*24*time.Hour).Err()
		if err != nil {
			return "", fmt.Errorf("failed to store refresh token: %w", err)
		}
	}

	return signedToken, err
}

// generateJTI creates a unique JWT ID to prevent replay attacks
func (s *Server) generateJTI() string {
	return fmt.Sprintf("%d-%s", time.Now().Unix(), uuid.New().String()[:8])
}
