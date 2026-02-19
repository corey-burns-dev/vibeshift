// Package observability provides logging, metrics, and tracing.
package observability

import (
	"context"
	"fmt"
	"log/slog"
	"os"
)

// Logger wraps slog.Logger to provide specialized logging methods.
type Logger struct {
	*slog.Logger
}

// GlobalLogger is the default logger instance for the application.
var GlobalLogger *Logger

func init() {
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})
	GlobalLogger = &Logger{Logger: slog.New(handler)}
}

// LogContextKey is a type for context keys used by the logging package.
type LogContextKey string

// Context keys for logging
const (
	CorrelationID LogContextKey = "correlation_id"
	SpanID        LogContextKey = "span_id"
	TraceID       LogContextKey = "trace_id"
)

// LoggingConfig defines which types of automated logging are enabled.
type LoggingConfig struct {
	EnableCorrelationID bool
	EnableRepoLogging   bool
	EnableWSLogging     bool
}

var (
	// Config holds the current logging configuration.
	Config = LoggingConfig{
		EnableCorrelationID: true,
		EnableRepoLogging:   true,
		EnableWSLogging:     true,
	}
)

// GenerateCorrelationID creates a new unique correlation ID.
func GenerateCorrelationID() string {
	return fmt.Sprintf("%d", 0)
}

// WithCorrelationID returns a new context with the given correlation ID.
func WithCorrelationID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, CorrelationID, id)
}

// ExtractCorrelationID retrieves the correlation ID from the context.
func ExtractCorrelationID(ctx context.Context) string {
	if id := ctx.Value(CorrelationID); id != nil {
		return id.(string)
	}
	return ""
}

// RepoLogger provides structured logging for repository operations.
type RepoLogger struct {
	tableName string
	logger    *Logger
}

// NewRepoLogger creates a new RepoLogger for the given table.
func NewRepoLogger(tableName string) *RepoLogger {
	return &RepoLogger{
		tableName: tableName,
		logger:    GlobalLogger,
	}
}

// LogCreate logs a repository create operation.
func (l *RepoLogger) LogCreate(ctx context.Context, fields map[string]interface{}) {
	if !Config.EnableRepoLogging {
		return
	}
	attrs := []any{
		slog.String("table", l.tableName),
		slog.String("operation", "create"),
		slog.String("correlation_id", ExtractCorrelationID(ctx)),
	}
	for k, v := range fields {
		attrs = append(attrs, slog.Any(k, v))
	}
	l.logger.InfoContext(ctx, "repository create", attrs...)
}

// LogRead logs a repository read operation.
func (l *RepoLogger) LogRead(ctx context.Context, fields map[string]interface{}) {
	if !Config.EnableRepoLogging {
		return
	}
	attrs := []any{
		slog.String("table", l.tableName),
		slog.String("operation", "read"),
		slog.String("correlation_id", ExtractCorrelationID(ctx)),
	}
	for k, v := range fields {
		attrs = append(attrs, slog.Any(k, v))
	}
	l.logger.InfoContext(ctx, "repository read", attrs...)
}

// LogUpdate logs a repository update operation.
func (l *RepoLogger) LogUpdate(ctx context.Context, fields map[string]interface{}) {
	if !Config.EnableRepoLogging {
		return
	}
	attrs := []any{
		slog.String("table", l.tableName),
		slog.String("operation", "update"),
		slog.String("correlation_id", ExtractCorrelationID(ctx)),
	}
	for k, v := range fields {
		attrs = append(attrs, slog.Any(k, v))
	}
	l.logger.InfoContext(ctx, "repository update", attrs...)
}

// LogDelete logs a repository delete operation.
func (l *RepoLogger) LogDelete(ctx context.Context, fields map[string]interface{}) {
	if !Config.EnableRepoLogging {
		return
	}
	attrs := []any{
		slog.String("table", l.tableName),
		slog.String("operation", "delete"),
		slog.String("correlation_id", ExtractCorrelationID(ctx)),
	}
	for k, v := range fields {
		attrs = append(attrs, slog.Any(k, v))
	}
	l.logger.InfoContext(ctx, "repository delete", attrs...)
}

// LogError logs a repository error.
func (l *RepoLogger) LogError(ctx context.Context, err error, operation string) {
	if !Config.EnableRepoLogging {
		return
	}
	l.logger.ErrorContext(ctx, "repository error",
		slog.String("table", l.tableName),
		slog.String("operation", operation),
		slog.String("correlation_id", ExtractCorrelationID(ctx)),
		slog.String("error", err.Error()),
	)
}

// WSLogger provides structured logging for WebSocket operations.
type WSLogger struct {
	hubName string
	logger  *Logger
}

// NewWSLogger creates a new WSLogger for the given hub.
func NewWSLogger(hubName string) *WSLogger {
	return &WSLogger{
		hubName: hubName,
		logger:  GlobalLogger,
	}
}

// LogConnect logs a WebSocket connection event.
func (l *WSLogger) LogConnect(ctx context.Context, userID uint, roomID string) {
	if !Config.EnableWSLogging {
		return
	}
	l.logger.InfoContext(ctx, "websocket connected",
		slog.String("hub", l.hubName),
		slog.Uint64("user_id", uint64(userID)),
		slog.String("room_id", roomID),
		slog.String("correlation_id", ExtractCorrelationID(ctx)),
	)
}

// LogDisconnect logs a WebSocket disconnection event.
func (l *WSLogger) LogDisconnect(ctx context.Context, userID uint, roomID string, reason string) {
	if !Config.EnableWSLogging {
		return
	}
	l.logger.InfoContext(ctx, "websocket disconnected",
		slog.String("hub", l.hubName),
		slog.Uint64("user_id", uint64(userID)),
		slog.String("room_id", roomID),
		slog.String("reason", reason),
		slog.String("correlation_id", ExtractCorrelationID(ctx)),
	)
}

// LogError logs a WebSocket error event.
func (l *WSLogger) LogError(ctx context.Context, userID uint, roomID string, err error, eventType string) {
	if !Config.EnableWSLogging {
		return
	}
	l.logger.ErrorContext(ctx, "websocket error",
		slog.String("hub", l.hubName),
		slog.Uint64("user_id", uint64(userID)),
		slog.String("room_id", roomID),
		slog.String("event_type", eventType),
		slog.String("error", err.Error()),
		slog.String("correlation_id", ExtractCorrelationID(ctx)),
	)
}

// LogMessage logs an incoming WebSocket message.
func (l *WSLogger) LogMessage(ctx context.Context, userID uint, roomID string, messageType string) {
	if !Config.EnableWSLogging {
		return
	}
	l.logger.InfoContext(ctx, "websocket message",
		slog.String("hub", l.hubName),
		slog.Uint64("user_id", uint64(userID)),
		slog.String("room_id", roomID),
		slog.String("message_type", messageType),
		slog.String("correlation_id", ExtractCorrelationID(ctx)),
	)
}

// LogLifecycle logs a WebSocket hub lifecycle event.
func (l *WSLogger) LogLifecycle(ctx context.Context, event string, fields map[string]interface{}) {
	if !Config.EnableWSLogging {
		return
	}
	attrs := []any{
		slog.String("hub", l.hubName),
		slog.String("event", event),
		slog.String("correlation_id", ExtractCorrelationID(ctx)),
	}
	for k, v := range fields {
		attrs = append(attrs, slog.Any(k, v))
	}
	l.logger.InfoContext(ctx, "websocket lifecycle", attrs...)
}

// LogAsyncOperationStart logs the start of an asynchronous operation.
func LogAsyncOperationStart(ctx context.Context, operation string, fields map[string]interface{}) {
	attrs := []any{
		slog.String("operation", operation),
		slog.String("type", "async_start"),
		slog.String("correlation_id", ExtractCorrelationID(ctx)),
	}
	for k, v := range fields {
		attrs = append(attrs, slog.Any(k, v))
	}
	GlobalLogger.InfoContext(ctx, "async operation started", attrs...)
}

// LogAsyncOperationEnd logs the completion of an asynchronous operation.
func LogAsyncOperationEnd(ctx context.Context, operation string, fields map[string]interface{}) {
	attrs := []any{
		slog.String("operation", operation),
		slog.String("type", "async_end"),
		slog.String("correlation_id", ExtractCorrelationID(ctx)),
	}
	for k, v := range fields {
		attrs = append(attrs, slog.Any(k, v))
	}
	GlobalLogger.InfoContext(ctx, "async operation completed", attrs...)
}

// LogAsyncOperationError logs an error in an asynchronous operation.
func LogAsyncOperationError(ctx context.Context, operation string, err error, fields map[string]interface{}) {
	attrs := []any{
		slog.String("operation", operation),
		slog.String("type", "async_error"),
		slog.String("error", err.Error()),
		slog.String("correlation_id", ExtractCorrelationID(ctx)),
	}
	for k, v := range fields {
		attrs = append(attrs, slog.Any(k, v))
	}
	GlobalLogger.ErrorContext(ctx, "async operation failed", attrs...)
}

// StructuredLogger provides a general-purpose structured logger.
type StructuredLogger struct{}

// NewStructuredLogger creates a new StructuredLogger instance.
func NewStructuredLogger() *StructuredLogger {
	return &StructuredLogger{}
}

// LogWithCorrelation logs a message with the current correlation ID.
func (l *StructuredLogger) LogWithCorrelation(ctx context.Context, msg string, fields map[string]interface{}) {
	attrs := []any{
		slog.String("correlation_id", ExtractCorrelationID(ctx)),
	}
	for k, v := range fields {
		attrs = append(attrs, slog.Any(k, v))
	}
	GlobalLogger.InfoContext(ctx, msg, attrs...)
}

// LogServiceCall logs a service method call.
func (l *StructuredLogger) LogServiceCall(ctx context.Context, service, method string, fields map[string]interface{}) {
	attrs := []any{
		slog.String("service", service),
		slog.String("method", method),
		slog.String("type", "service_call"),
		slog.String("correlation_id", ExtractCorrelationID(ctx)),
	}
	for k, v := range fields {
		attrs = append(attrs, slog.Any(k, v))
	}
	GlobalLogger.InfoContext(ctx, "service call", attrs...)
}
