package middleware

import (
	"context"
	"log/slog"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
)

// Logger is the global structured logger instance used throughout the application.
var Logger *slog.Logger

type contextKey string

const (
	RequestIDKey contextKey = "request_id"
	UserIDKey    contextKey = "user_id"
	TraceIDKey   contextKey = "trace_id"
)

// ctxHandler is a slog.Handler that adds context values to the log record.
type ctxHandler struct {
	slog.Handler
}

// Handle adds context values to the record before passing it to the underlying handler.
func (h *ctxHandler) Handle(ctx context.Context, r slog.Record) error {
	if rid, ok := ctx.Value(RequestIDKey).(string); ok {
		r.AddAttrs(slog.String("request_id", rid))
	}
	if uid, ok := ctx.Value(UserIDKey).(uint); ok {
		r.AddAttrs(slog.Any("user_id", uid))
	}
	if tid, ok := ctx.Value(TraceIDKey).(string); ok {
		r.AddAttrs(slog.String("trace_id", tid))
	}
	return h.Handler.Handle(ctx, r)
}

func init() {
	// Initialize a structured logger based on environment
	var handler slog.Handler
	level := slog.LevelInfo

	if os.Getenv("APP_ENV") == "production" {
		handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})
	} else {
		// Pretty text output for local development
		handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: level})
	}

	// Wrap with our context-aware handler
	Logger = slog.New(&ctxHandler{handler})
}

// ContextMiddleware injects request ID and user ID from Fiber locals into the request context.
// This allows these values to be picked up by the context-aware logger even in deep service layers.
func ContextMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		ctx := c.UserContext()

		// Extract Request ID
		if rid := c.Locals("requestid"); rid != nil {
			if ridStr, ok := rid.(string); ok {
				ctx = context.WithValue(ctx, RequestIDKey, ridStr)
			}
		}

		// Extract User ID (may be set later by Auth middleware, so this should ideally run after Auth for user_id)
		// but since we want it for logging all requests, we can just check if it's there.
		if uid := c.Locals("userID"); uid != nil {
			if uidUint, ok := uid.(uint); ok {
				ctx = context.WithValue(ctx, UserIDKey, uidUint)
			}
		}

		// Extract Trace ID
		if tid := c.Locals("traceID"); tid != nil {
			if tidStr, ok := tid.(string); ok {
				ctx = context.WithValue(ctx, TraceIDKey, tidStr)
			}
		}

		c.SetUserContext(ctx)
		return c.Next()
	}
}

// StructuredLogger returns a Fiber middleware for logging requests using slog
func StructuredLogger() fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()

		// Process request
		err := c.Next()

		// Log details after request is handled
		status := c.Response().StatusCode()
		latency := time.Since(start)

		fields := []any{
			slog.Int("status", status),
			slog.String("method", c.Method()),
			slog.String("path", c.Path()),
			slog.String("ip", c.IP()),
			slog.Duration("latency", latency),
			slog.String("user_agent", c.Get("User-Agent")),
		}

		// We use InfoContext/ErrorContext so that the ctxHandler can pick up the rid/uid
		if err != nil {
			fields = append(fields, slog.String("error", err.Error()))
			Logger.ErrorContext(c.UserContext(), "request failed", fields...)
		} else {
			Logger.InfoContext(c.UserContext(), "request processed", fields...)
		}

		return err
	}
}
