package observability

import (
	"context"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"gorm.io/gorm"
)

var (
	// RedisErrorRate counts Redis errors by operation type.
	RedisErrorRate = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "sanctum_redis_error_rate_total",
		Help: "Total number of Redis errors by operation type",
	}, []string{"operation"})

	// DatabaseQueryLatency records database query latency by operation and table.
	DatabaseQueryLatency = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "sanctum_database_query_latency_seconds",
		Help:    "Database query latency in seconds",
		Buckets: prometheus.DefBuckets,
	}, []string{"operation", "table"})

	// WebSocketRoomConnections is the gauge of connections per room.
	WebSocketRoomConnections = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "sanctum_websocket_room_connections",
		Help: "Number of WebSocket connections per room",
	}, []string{"room_id"})

	// MessageThroughput counts messages processed per room and type.
	MessageThroughput = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "sanctum_message_throughput_total",
		Help: "Total number of messages processed",
	}, []string{"room_id", "message_type"})

	// WebSocketConnectionsTotal is the gauge of total WebSocket connections.
	WebSocketConnectionsTotal = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "sanctum_websocket_connections_total",
		Help: "Total number of active WebSocket connections",
	})

	// WebSocketEventsTotal counts WebSocket events by type.
	WebSocketEventsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "sanctum_websocket_events_total",
		Help: "Total WebSocket events by type",
	}, []string{"event_type"})

	// WebSocketBackpressureDrops counts messages dropped due to backpressure by hub and reason.
	WebSocketBackpressureDrops = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "sanctum_websocket_backpressure_drops_total",
		Help: "Total number of WebSocket messages dropped due to backpressure",
	}, []string{"hub", "reason"})
)

// DatabaseMetrics wraps DB access for recording query latency.
type DatabaseMetrics struct {
	db *gorm.DB
}

// NewDatabaseMetrics returns a new DatabaseMetrics instance.
func NewDatabaseMetrics(db *gorm.DB) *DatabaseMetrics {
	return &DatabaseMetrics{db: db}
}

// ObserveQuery records the latency of a database query.
func (m *DatabaseMetrics) ObserveQuery(operation, table string, start time.Time) {
	latency := time.Since(start).Seconds()
	DatabaseQueryLatency.WithLabelValues(operation, table).Observe(latency)
}

// TrackQuery returns a function that records query latency when called (e.g. defer).
func (m *DatabaseMetrics) TrackQuery(operation, table string) func() {
	start := time.Now()
	return func() {
		m.ObserveQuery(operation, table, start)
	}
}

// WebSocketRoomMetrics tracks WebSocket room and connection counts.
type WebSocketRoomMetrics struct {
	roomCounts map[string]int
}

// NewWebSocketRoomMetrics returns a new WebSocketRoomMetrics instance.
func NewWebSocketRoomMetrics() *WebSocketRoomMetrics {
	return &WebSocketRoomMetrics{
		roomCounts: make(map[string]int),
	}
}

// IncrementRoom increments the connection count for the room.
func (m *WebSocketRoomMetrics) IncrementRoom(roomID string) {
	m.roomCounts[roomID]++
	WebSocketRoomConnections.WithLabelValues(roomID).Inc()
	WebSocketConnectionsTotal.Inc()
}

// DecrementRoom decrements the connection count for the room.
func (m *WebSocketRoomMetrics) DecrementRoom(roomID string) {
	if m.roomCounts[roomID] > 0 {
		m.roomCounts[roomID]--
	}
	WebSocketRoomConnections.WithLabelValues(roomID).Dec()
	WebSocketConnectionsTotal.Dec()
}

// GetRoomCount returns the current connection count for the room.
func (m *WebSocketRoomMetrics) GetRoomCount(roomID string) int {
	return m.roomCounts[roomID]
}

// RecordMessage increments message throughput counters for the room and type.
func (*WebSocketRoomMetrics) RecordMessage(roomID, messageType string) {
	MessageThroughput.WithLabelValues(roomID, messageType).Inc()
}

// RecordWebSocketEvent increments the WebSocket events counter for the event type.
func (*WebSocketRoomMetrics) RecordWebSocketEvent(eventType string) {
	WebSocketEventsTotal.WithLabelValues(eventType).Inc()
}

// MessageMetrics records message and WebSocket event metrics.
type MessageMetrics struct{}

// NewMessageMetrics returns a new MessageMetrics instance.
func NewMessageMetrics() *MessageMetrics {
	return &MessageMetrics{}
}

// RecordMessage increments message throughput counters.
func (*MessageMetrics) RecordMessage(roomID, messageType string) {
	MessageThroughput.WithLabelValues(roomID, messageType).Inc()
}

// RecordWebSocketEvent increments the WebSocket events counter.
func (*MessageMetrics) RecordWebSocketEvent(eventType string) {
	WebSocketEventsTotal.WithLabelValues(eventType).Inc()
}

// TracingContextKey is the type for context keys used in tracing.
type TracingContextKey string

const (
	// TraceIDKey is the context key for trace ID.
	TraceIDKey TracingContextKey = "trace_id"
	// SpanIDKey is the context key for span ID.
	SpanIDKey TracingContextKey = "span_id"
	// CorrelationIDKey is the context key for correlation ID.
	CorrelationIDKey TracingContextKey = "correlation_id"
)

// ExtractTraceID returns the trace ID from the context if set.
func ExtractTraceID(ctx context.Context) string {
	if id := ctx.Value(TraceIDKey); id != nil {
		return id.(string)
	}
	return ""
}

// ExtractCorrelationIDFromTracing returns the correlation ID from the context if set.
func ExtractCorrelationIDFromTracing(ctx context.Context) string {
	if id := ctx.Value(CorrelationIDKey); id != nil {
		return id.(string)
	}
	return ""
}

// NewSpanContext returns a context with trace and span ID values set.
func NewSpanContext(traceID, spanID string) context.Context {
	ctx := context.Background()
	ctx = context.WithValue(ctx, TraceIDKey, traceID)
	ctx = context.WithValue(ctx, SpanIDKey, spanID)
	return ctx
}

// WithCorrelationIDFromTracing returns a context with the correlation ID set.
func WithCorrelationIDFromTracing(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, CorrelationIDKey, id)
}

// GenerateTraceID returns a new trace ID string.
func GenerateTraceID() string {
	return strconv.FormatInt(time.Now().UnixNano(), 36)
}

// GenerateSpanID returns a new span ID string.
// GenerateSpanID returns a new span ID string.
func GenerateSpanID() string {
	return strconv.FormatInt(time.Now().UnixNano()%10000000000, 36)
}
