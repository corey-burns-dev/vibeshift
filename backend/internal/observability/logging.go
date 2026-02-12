package observability

import (
	"context"
	"fmt"
	"log/slog"
	"os"
)

type Logger struct {
	*slog.Logger
}

var GlobalLogger *Logger

func init() {
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})
	GlobalLogger = &Logger{Logger: slog.New(handler)}
}

type LogContextKey string

const (
	CorrelationID LogContextKey = "correlation_id"
	SpanID        LogContextKey = "span_id"
	TraceID       LogContextKey = "trace_id"
)

type LoggingConfig struct {
	EnableCorrelationID bool
	EnableRepoLogging   bool
	EnableWSLogging     bool
}

var (
	Config = LoggingConfig{
		EnableCorrelationID: true,
		EnableRepoLogging:   true,
		EnableWSLogging:     true,
	}
)

func GenerateCorrelationID() string {
	return fmt.Sprintf("%d", 0)
}

func WithCorrelationID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, CorrelationID, id)
}

func ExtractCorrelationID(ctx context.Context) string {
	if id := ctx.Value(CorrelationID); id != nil {
		return id.(string)
	}
	return ""
}

type RepoLogger struct {
	tableName string
	logger    *Logger
}

func NewRepoLogger(tableName string) *RepoLogger {
	return &RepoLogger{
		tableName: tableName,
		logger:    GlobalLogger,
	}
}

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

type WSLogger struct {
	hubName string
	logger  *Logger
}

func NewWSLogger(hubName string) *WSLogger {
	return &WSLogger{
		hubName: hubName,
		logger:  GlobalLogger,
	}
}

func (l *WSLogger) LogConnect(ctx context.Context, userID uint, roomID string) {
	if !Config.EnableWSLogging {
		return
	}
	l.logger.InfoContext(ctx, "websocket connected",
		slog.String("hub", l.hubName),
		slog.Int("user_id", int(userID)),
		slog.String("room_id", roomID),
		slog.String("correlation_id", ExtractCorrelationID(ctx)),
	)
}

func (l *WSLogger) LogDisconnect(ctx context.Context, userID uint, roomID string, reason string) {
	if !Config.EnableWSLogging {
		return
	}
	l.logger.InfoContext(ctx, "websocket disconnected",
		slog.String("hub", l.hubName),
		slog.Int("user_id", int(userID)),
		slog.String("room_id", roomID),
		slog.String("reason", reason),
		slog.String("correlation_id", ExtractCorrelationID(ctx)),
	)
}

func (l *WSLogger) LogError(ctx context.Context, userID uint, roomID string, err error, eventType string) {
	if !Config.EnableWSLogging {
		return
	}
	l.logger.ErrorContext(ctx, "websocket error",
		slog.String("hub", l.hubName),
		slog.Int("user_id", int(userID)),
		slog.String("room_id", roomID),
		slog.String("event_type", eventType),
		slog.String("error", err.Error()),
		slog.String("correlation_id", ExtractCorrelationID(ctx)),
	)
}

func (l *WSLogger) LogMessage(ctx context.Context, userID uint, roomID string, messageType string) {
	if !Config.EnableWSLogging {
		return
	}
	l.logger.InfoContext(ctx, "websocket message",
		slog.String("hub", l.hubName),
		slog.Int("user_id", int(userID)),
		slog.String("room_id", roomID),
		slog.String("message_type", messageType),
		slog.String("correlation_id", ExtractCorrelationID(ctx)),
	)
}

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

type StructuredLogger struct{}

func NewStructuredLogger() *StructuredLogger {
	return &StructuredLogger{}
}

func (l *StructuredLogger) LogWithCorrelation(ctx context.Context, msg string, fields map[string]interface{}) {
	attrs := []any{
		slog.String("correlation_id", ExtractCorrelationID(ctx)),
	}
	for k, v := range fields {
		attrs = append(attrs, slog.Any(k, v))
	}
	GlobalLogger.InfoContext(ctx, msg, attrs...)
}

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
