package observability

import (
	"context"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/exporters/stdout/stdouttrace"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
	"go.opentelemetry.io/otel/trace"
)

var Tracer trace.Tracer

type TracingConfig struct {
	ServiceName    string
	ServiceVersion string
	Environment    string
	Enabled        bool
}

func InitTracing(cfg TracingConfig) error {
	if !cfg.Enabled {
		Tracer = otel.Tracer(cfg.ServiceName)
		return nil
	}

	exporter, err := stdouttrace.New(stdouttrace.WithPrettyPrint())
	if err != nil {
		return err
	}

	res, err := resource.New(context.Background(),
		resource.WithAttributes(
			semconv.ServiceName(cfg.ServiceName),
			semconv.ServiceVersion(cfg.ServiceVersion),
			attribute.String("environment", cfg.Environment),
		),
	)
	if err != nil {
		return err
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
	)

	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	Tracer = tp.Tracer(cfg.ServiceName)

	return nil
}

type Span struct {
	span trace.Span
	ctx  context.Context
	name string
}

func NewSpan(ctx context.Context, name string, opts ...trace.SpanStartOption) (*Span, context.Context) {
	s := &Span{name: name}
	ctx, span := Tracer.Start(ctx, name, opts...)
	s.span = span
	s.ctx = ctx
	return s, ctx
}

func (s *Span) AddAttributes(attrs ...attribute.KeyValue) {
	if s.span != nil {
		s.span.SetAttributes(attrs...)
	}
}

func (s *Span) SetError(err error) {
	if s.span != nil && err != nil {
		s.span.RecordError(err)
		s.span.SetStatus(codes.Error, err.Error())
	}
}

func (s *Span) End() {
	if s.span != nil {
		s.span.End()
	}
}

func (s *Span) TraceID() string {
	if s.span != nil {
		return s.span.SpanContext().TraceID().String()
	}
	return ""
}

func (s *Span) SpanID() string {
	if s.span != nil {
		return s.span.SpanContext().SpanID().String()
	}
	return ""
}

type SpanKind string

const (
	SpanKindInternal SpanKind = "internal"
	SpanKindServer   SpanKind = "server"
	SpanKindClient   SpanKind = "client"
)

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

type TraceLayer struct {
	tracer trace.Tracer
}

func NewTraceLayer(tracer trace.Tracer) *TraceLayer {
	return &TraceLayer{tracer: tracer}
}

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

func GetTraceLayer() *TraceLayer {
	return NewTraceLayer(Tracer)
}

func AddTraceAttributesToContext(ctx context.Context, attrs ...attribute.KeyValue) {
	span := trace.SpanFromContext(ctx)
	if span != nil {
		span.SetAttributes(attrs...)
	}
}

func RecordErrorInContext(ctx context.Context, err error) {
	span := trace.SpanFromContext(ctx)
	if span != nil {
		span.RecordError(err)
	}
}

type TraceContextKey string

const (
	RequestIDKey TraceContextKey = "request_id"
	UserIDKey    TraceContextKey = "user_id"
	RoomIDKey    TraceContextKey = "room_id"
	OperationKey TraceContextKey = "operation"
)

func ExtractRequestID(ctx context.Context) string {
	if id := ctx.Value(RequestIDKey); id != nil {
		return id.(string)
	}
	return ""
}

func ExtractUserID(ctx context.Context) string {
	if id := ctx.Value(UserIDKey); id != nil {
		return id.(string)
	}
	return ""
}

func ExtractRoomID(ctx context.Context) string {
	if id := ctx.Value(RoomIDKey); id != nil {
		return id.(string)
	}
	return ""
}
