// Package models contains data structures for the application's domain models.
package models

import (
	"errors"
	"fmt"

	"github.com/gofiber/fiber/v2"
)

// ErrorResponse represents a standardized API error response
type ErrorResponse struct {
	Error     string `json:"error"`
	Code      string `json:"code,omitempty"`
	Details   string `json:"details,omitempty"`
	RequestID string `json:"request_id,omitempty"`
}

// AppError represents a custom application error
type AppError struct {
	Code    string
	Message string
	Err     error
}

func (e *AppError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Err)
	}
	return e.Message
}

func (e *AppError) Unwrap() error {
	return e.Err
}

// NewNotFoundError creates a new not found error for the given resource.
func NewNotFoundError(resource string, id interface{}) *AppError {
	return &AppError{
		Code:    "NOT_FOUND",
		Message: fmt.Sprintf("%s with ID %v not found", resource, id),
	}
}

// NewValidationError creates a new validation error with the given message.
func NewValidationError(message string) *AppError {
	return &AppError{
		Code:    "VALIDATION_ERROR",
		Message: message,
	}
}

// NewUnauthorizedError creates a new unauthorized error with the given message.
func NewUnauthorizedError(message string) *AppError {
	return &AppError{
		Code:    "UNAUTHORIZED",
		Message: message,
	}
}

// NewInternalError creates a new internal error wrapping the given error.
func NewInternalError(err error) *AppError {
	return &AppError{
		Code:    "INTERNAL_ERROR",
		Message: "Internal server error",
		Err:     err,
	}
}

// RespondWithError creates a standardized error response
func RespondWithError(c *fiber.Ctx, status int, err error) error {
	var response ErrorResponse
	var appErr *AppError

	rid := ""
	if val := c.Locals("requestid"); val != nil {
		rid = fmt.Sprintf("%v", val)
	}

	if errors.As(err, &appErr) {
		response = ErrorResponse{
			Error:     appErr.Message,
			Code:      appErr.Code,
			RequestID: rid,
		}
		if appErr.Err != nil {
			response.Details = appErr.Err.Error()
		}
	} else {
		response = ErrorResponse{
			Error:     err.Error(),
			RequestID: rid,
		}
	}
	return c.Status(status).JSON(response)
}
