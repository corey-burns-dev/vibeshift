package observability

import (
	"context"
	"fmt"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/exporters/stdout/stdouttrace"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
	"go.opentelemetry.io/otel/trace"
)

// Tracer is the global tracer used for the application.
var Tracer trace.Tracer = otel.Tracer("sanctum-api")

// TracingConfig holds configuration for initializing the tracer.
type TracingConfig struct {
	ServiceName    string
	ServiceVersion string
	Environment    string
	Enabled        bool
	Exporter       string // "stdout" or "otlp"
	OTLPEndpoint   string
	SamplerRatio   float64
}

// InitTracing initializes the OpenTelemetry tracer provider.
// Returns a shutdown function and an error.
func InitTracing(cfg TracingConfig) (func(context.Context) error, error) {
	if !cfg.Enabled {
		Tracer = otel.Tracer(cfg.ServiceName)
		return func(_ context.Context) error { return nil }, nil
	}

	var exporter sdktrace.SpanExporter
	var err error

	switch cfg.Exporter {
	case "otlp":
		exporter, err = otlptracehttp.New(context.Background(),
			otlptracehttp.WithEndpoint(cfg.OTLPEndpoint),
			otlptracehttp.WithInsecure(), // Adjust as needed for production
		)
	case "stdout":
		fallthrough
	default:
		exporter, err = stdouttrace.New(stdouttrace.WithPrettyPrint())
	}

	if err != nil {
		return nil, fmt.Errorf("failed to create tracing exporter: %w", err)
	}

	res, err := resource.New(context.Background(),
		resource.WithAttributes(
			semconv.ServiceName(cfg.ServiceName),
			semconv.ServiceVersion(cfg.ServiceVersion),
			attribute.String("environment", cfg.Environment),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create resource: %w", err)
	}

	sampler := sdktrace.ParentBased(sdktrace.TraceIDRatioBased(cfg.SamplerRatio))
	if cfg.SamplerRatio >= 1.0 {
		sampler = sdktrace.AlwaysSample()
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sampler),
	)

	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	Tracer = tp.Tracer(cfg.ServiceName)

	return tp.Shutdown, nil
}

// Span wraps an OpenTelemetry span and context for convenience.
type Span struct {
	span trace.Span
	ctx  context.Context
	name string
}

// NewSpan starts a new span and returns the wrapper and updated context.
func NewSpan(ctx context.Context, name string, opts ...trace.SpanStartOption) (*Span, context.Context) {
	s := &Span{name: name}
	ctx, span := Tracer.Start(ctx, name, opts...)
	s.span = span
	s.ctx = ctx
	return s, ctx
}

// AddAttributes sets attributes on the span.
func (s *Span) AddAttributes(attrs ...attribute.KeyValue) {
	if s.span != nil {
		s.span.SetAttributes(attrs...)
	}
}

// SetError records the error on the span and sets span status to Error.
func (s *Span) SetError(err error) {
	if s.span != nil && err != nil {
		s.span.RecordError(err)
		s.span.SetStatus(codes.Error, err.Error())
	}
}

// End ends the span.
func (s *Span) End() {
	if s.span != nil {
		s.span.End()
	}
}

// TraceID returns the trace ID of the span.
func (s *Span) TraceID() string {
	if s.span != nil {
		return s.span.SpanContext().TraceID().String()
	}
	return ""
}

// SpanID returns the span ID of the span.
func (s *Span) SpanID() string {
	if s.span != nil {
		return s.span.SpanContext().SpanID().String()
	}
	return ""
}

// SpanKind represents the kind of span (internal, server, client).
type SpanKind string

const (
	// SpanKindInternal marks a span as internal.
	SpanKindInternal SpanKind = "internal"
	// SpanKindServer marks a span as server.
	SpanKindServer SpanKind = "server"
	// SpanKindClient marks a span as client.
	SpanKindClient SpanKind = "client"
)

// WithSpanKind returns a span start option that sets the span kind.
func WithSpanKind(kind SpanKind) trace.SpanStartOption {
	switch kind {
	case SpanKindInternal:
		return trace.WithSpanKind(trace.SpanKindInternal)
	case SpanKindServer:
		return trace.WithSpanKind(trace.SpanKindServer)
	case SpanKindClient:
		return trace.WithSpanKind(trace.SpanKindClient)
	default:
		return trace.WithSpanKind(trace.SpanKindInternal)
	}
}

// TraceLayer provides helpers to start spans for repository, Redis, WebSocket, and RPC.
type TraceLayer struct {
	tracer trace.Tracer
}

// NewTraceLayer returns a new TraceLayer for the given tracer.
func NewTraceLayer(tracer trace.Tracer) *TraceLayer {
	return &TraceLayer{tracer: tracer}
}

// TraceRepositoryMethod starts a span for a repository method call.
func (l *TraceLayer) TraceRepositoryMethod(ctx context.Context, methodName, tableName string) (context.Context, trace.Span) {
	ctx, span := l.tracer.Start(ctx, "repository."+methodName,
		trace.WithSpanKind(trace.SpanKindInternal),
	)
	span.SetAttributes(
		attribute.String("db.system", "postgresql"),
		attribute.String("db.operation", methodName),
		attribute.String("db.table", tableName),
	)
	return ctx, span
}

// TraceRedisOperation starts a span for a Redis operation.
func (l *TraceLayer) TraceRedisOperation(ctx context.Context, operation string) (context.Context, trace.Span) {
	ctx, span := l.tracer.Start(ctx, "redis."+operation,
		trace.WithSpanKind(trace.SpanKindClient),
	)
	span.SetAttributes(
		attribute.String("db.system", "redis"),
		attribute.String("db.operation", operation),
	)
	return ctx, span
}

// TraceWebSocket starts a span for a WebSocket event.
func (l *TraceLayer) TraceWebSocket(ctx context.Context, hubName, eventType string) (context.Context, trace.Span) {
	ctx, span := l.tracer.Start(ctx, "websocket."+eventType,
		trace.WithSpanKind(trace.SpanKindServer),
	)
	span.SetAttributes(
		attribute.String("websocket.hub", hubName),
		attribute.String("websocket.event", eventType),
	)
	return ctx, span
}

// TraceAPIToServiceCall starts a span for an API-to-service call.
func (l *TraceLayer) TraceAPIToServiceCall(ctx context.Context, serviceName, method string) (context.Context, trace.Span) {
	ctx, span := l.tracer.Start(ctx, serviceName+"."+method,
		trace.WithSpanKind(trace.SpanKindInternal),
	)
	span.SetAttributes(
		attribute.String("rpc.service", serviceName),
		attribute.String("rpc.method", method),
	)
	return ctx, span
}

// TraceServiceToRepository starts a span for a service-to-repository call.
func (l *TraceLayer) TraceServiceToRepository(ctx context.Context, repoName, method string) (context.Context, trace.Span) {
	ctx, span := l.tracer.Start(ctx, repoName+"."+method,
		trace.WithSpanKind(trace.SpanKindInternal),
	)
	span.SetAttributes(
		attribute.String("repo.name", repoName),
		attribute.String("repo.method", method),
	)
	return ctx, span
}

// GetTraceLayer returns a TraceLayer using the global Tracer.
func GetTraceLayer() *TraceLayer {
	return NewTraceLayer(Tracer)
}

// AddTraceAttributesToContext sets the given attributes on the span in ctx.
func AddTraceAttributesToContext(ctx context.Context, attrs ...attribute.KeyValue) {
	span := trace.SpanFromContext(ctx)
	if span != nil {
		span.SetAttributes(attrs...)
	}
}

// RecordErrorInContext records the error on the span in ctx.
func RecordErrorInContext(ctx context.Context, err error) {
	span := trace.SpanFromContext(ctx)
	if span != nil {
		span.RecordError(err)
	}
}

// TraceContextKey is the type for request-scoped context keys.
type TraceContextKey string

const (
	// RequestIDKey is the context key for request ID.
	RequestIDKey TraceContextKey = "request_id"
	// UserIDKey is the context key for user ID.
	UserIDKey TraceContextKey = "user_id"
	// RoomIDKey is the context key for room ID.
	RoomIDKey TraceContextKey = "room_id"
	// OperationKey is the context key for operation name.
	OperationKey TraceContextKey = "operation"
)

// ExtractRequestID returns the request ID from the context if set.
func ExtractRequestID(ctx context.Context) string {
	if id := ctx.Value(RequestIDKey); id != nil {
		return id.(string)
	}
	return ""
}

// ExtractUserID returns the user ID from the context if set.
func ExtractUserID(ctx context.Context) string {
	if id := ctx.Value(UserIDKey); id != nil {
		return id.(string)
	}
	return ""
}

// ExtractRoomID returns the room ID from the context if set.
func ExtractRoomID(ctx context.Context) string {
	if id := ctx.Value(RoomIDKey); id != nil {
		return id.(string)
	}
	return ""
}
