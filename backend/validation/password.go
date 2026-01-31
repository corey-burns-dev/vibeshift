// Package validation provides input validation utilities
package validation

import (
	"fmt"
	"regexp"
	"unicode"
)

// ValidatePassword checks if a password meets security requirements
func ValidatePassword(password string) error {
	// Check minimum length
	if len(password) < 12 {
		return fmt.Errorf("password must be at least 12 characters long")
	}

	// Check maximum length (prevent unreasonable inputs)
	if len(password) > 128 {
		return fmt.Errorf("password must not exceed 128 characters")
	}

	// Check for uppercase letter
	hasUpper := false
	for _, r := range password {
		if unicode.IsUpper(r) {
			hasUpper = true
			break
		}
	}
	if !hasUpper {
		return fmt.Errorf("password must contain at least one uppercase letter")
	}

	// Check for lowercase letter
	hasLower := false
	for _, r := range password {
		if unicode.IsLower(r) {
			hasLower = true
			break
		}
	}
	if !hasLower {
		return fmt.Errorf("password must contain at least one lowercase letter")
	}

	// Check for digit
	hasDigit := regexp.MustCompile(`[0-9]`).MatchString(password)
	if !hasDigit {
		return fmt.Errorf("password must contain at least one digit")
	}

	// Check for special character
	hasSpecial := regexp.MustCompile(`[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]`).MatchString(password)
	if !hasSpecial {
		return fmt.Errorf("password must contain at least one special character (!@#$%%^&*)")
	}

	return nil
}

// ValidateUsername checks if a username meets requirements
func ValidateUsername(username string) error {
	if len(username) < 3 {
		return fmt.Errorf("username must be at least 3 characters long")
	}

	if len(username) > 30 {
		return fmt.Errorf("username must not exceed 30 characters")
	}

	// Only allow alphanumeric and underscores
	if !regexp.MustCompile(`^[a-zA-Z0-9_-]+$`).MatchString(username) {
		return fmt.Errorf("username can only contain letters, numbers, underscores, and hyphens")
	}

	// Cannot start or end with underscore/hyphen
	if username[0] == '_' || username[0] == '-' || username[len(username)-1] == '_' || username[len(username)-1] == '-' {
		return fmt.Errorf("username cannot start or end with underscore or hyphen")
	}

	return nil
}

// ValidateEmail checks basic email format
func ValidateEmail(email string) error {
	// Simple email validation - regex approach
	emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
	if !emailRegex.MatchString(email) {
		return fmt.Errorf("invalid email format")
	}

	if len(email) > 254 {
		return fmt.Errorf("email must not exceed 254 characters")
	}

	return nil
}
