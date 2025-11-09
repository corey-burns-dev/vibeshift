package models

import (
	"fmt"

	"github.com/gofiber/fiber/v2"
)

// ErrorResponse represents a standardized API error response
type ErrorResponse struct {
	Error   string `json:"error"`
	Code    string `json:"code,omitempty"`
	Details string `json:"details,omitempty"`
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

// Predefined error constructors
func NewNotFoundError(resource string, id interface{}) *AppError {
	return &AppError{
		Code:    "NOT_FOUND",
		Message: fmt.Sprintf("%s with ID %v not found", resource, id),
	}
}

func NewValidationError(message string) *AppError {
	return &AppError{
		Code:    "VALIDATION_ERROR",
		Message: message,
	}
}

func NewUnauthorizedError(message string) *AppError {
	return &AppError{
		Code:    "UNAUTHORIZED",
		Message: message,
	}
}

func NewInternalError(err error) *AppError {
	return &AppError{
		Code:    "INTERNAL_ERROR",
		Message: "Internal server error",
		Err:     err,
	}
}

// respondWithError creates a standardized error response
func RespondWithError(c *fiber.Ctx, status int, err error) error {
	var response ErrorResponse

	if appErr, ok := err.(*AppError); ok {
		response = ErrorResponse{
			Error: appErr.Message,
			Code:  appErr.Code,
		}
		if appErr.Err != nil {
			response.Details = appErr.Err.Error()
		}
	} else {
		response = ErrorResponse{
			Error: err.Error(),
		}
	}

	return c.Status(status).JSON(response)
}
