package observability

import (
	"context"
	"strconv"
	"time"

	"sanctum/internal/middleware"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"gorm.io/gorm"
)

var (
	RedisErrorRate = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "sanctum_redis_error_rate_total",
		Help: "Total number of Redis errors by operation type",
	}, []string{"operation"})

	DatabaseQueryLatency = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "sanctum_database_query_latency_seconds",
		Help:    "Database query latency in seconds",
		Buckets: prometheus.DefBuckets,
	}, []string{"operation", "table"})

	WebSocketRoomConnections = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "sanctum_websocket_room_connections",
		Help: "Number of WebSocket connections per room",
	}, []string{"room_id"})

	MessageThroughput = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "sanctum_message_throughput_total",
		Help: "Total number of messages processed",
	}, []string{"room_id", "message_type"})

	WebSocketConnectionsTotal = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "sanctum_websocket_connections_total",
		Help: "Total number of active WebSocket connections",
	})

	WebSocketEventsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "sanctum_websocket_events_total",
		Help: "Total WebSocket events by type",
	}, []string{"event_type"})
)

type DatabaseMetrics struct {
	db *gorm.DB
}

func NewDatabaseMetrics(db *gorm.DB) *DatabaseMetrics {
	return &DatabaseMetrics{db: db}
}

func (m *DatabaseMetrics) ObserveQuery(operation, table string, start time.Time) {
	latency := time.Since(start).Seconds()
	DatabaseQueryLatency.WithLabelValues(operation, table).Observe(latency)
}

func (m *DatabaseMetrics) TrackQuery(operation, table string) func() {
	start := time.Now()
	return func() {
		m.ObserveQuery(operation, table, start)
	}
}

type WebSocketRoomMetrics struct {
	roomCounts map[string]int
}

func NewWebSocketRoomMetrics() *WebSocketRoomMetrics {
	return &WebSocketRoomMetrics{
		roomCounts: make(map[string]int),
	}
}

func (m *WebSocketRoomMetrics) IncrementRoom(roomID string) {
	m.roomCounts[roomID]++
	WebSocketRoomConnections.WithLabelValues(roomID).Inc()
	WebSocketConnectionsTotal.Inc()
}

func (m *WebSocketRoomMetrics) DecrementRoom(roomID string) {
	if m.roomCounts[roomID] > 0 {
		m.roomCounts[roomID]--
	}
	WebSocketRoomConnections.WithLabelValues(roomID).Dec()
	WebSocketConnectionsTotal.Dec()
}

func (m *WebSocketRoomMetrics) GetRoomCount(roomID string) int {
	return m.roomCounts[roomID]
}

func (m *WebSocketRoomMetrics) RecordMessage(roomID, messageType string) {
	MessageThroughput.WithLabelValues(roomID, messageType).Inc()
}

func (m *WebSocketRoomMetrics) RecordWebSocketEvent(eventType string) {
	WebSocketEventsTotal.WithLabelValues(eventType).Inc()
}

type MessageMetrics struct{}

func NewMessageMetrics() *MessageMetrics {
	return &MessageMetrics{}
}

func (m *MessageMetrics) RecordMessage(roomID, messageType string) {
	MessageThroughput.WithLabelValues(roomID, messageType).Inc()
}

func (m *MessageMetrics) RecordWebSocketEvent(eventType string) {
	WebSocketEventsTotal.WithLabelValues(eventType).Inc()
}

type TracingContextKey string

const (
	TraceIDKey       TracingContextKey = "trace_id"
	SpanIDKey        TracingContextKey = "span_id"
	CorrelationIDKey TracingContextKey = "correlation_id"
)

func ExtractTraceID(ctx context.Context) string {
	if id := ctx.Value(TraceIDKey); id != nil {
		return id.(string)
	}
	return ""
}

func ExtractCorrelationIDFromTracing(ctx context.Context) string {
	if id := ctx.Value(CorrelationIDKey); id != nil {
		return id.(string)
	}
	return ""
}

func NewSpanContext(traceID, spanID string) context.Context {
	ctx := context.Background()
	ctx = context.WithValue(ctx, TraceIDKey, traceID)
	ctx = context.WithValue(ctx, SpanIDKey, spanID)
	return ctx
}

func WithCorrelationIDFromTracing(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, CorrelationIDKey, id)
}

func GenerateTraceID() string {
	return strconv.FormatInt(time.Now().UnixNano(), 36)
}

func GenerateSpanID() string {
	return strconv.FormatInt(time.Now().UnixNano()%10000000000, 36)
}

func init() {
	middleware.Logger.Info("Observability metrics initialized")
}
