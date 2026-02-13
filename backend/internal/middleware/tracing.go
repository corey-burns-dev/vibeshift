package middleware

import (
	"fmt"

	"sanctum/internal/observability"

	"github.com/gofiber/fiber/v2"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
)

// TracingMiddleware adds OpenTelemetry tracing to requests
func TracingMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Extract propagation context from headers
		ctx := otel.GetTextMapPropagator().Extract(c.UserContext(), propagation.HeaderCarrier(c.GetReqHeaders()))

		// Start span
		spanName := fmt.Sprintf("%s %s", c.Method(), c.Path())
		ctx, span := observability.Tracer.Start(ctx, spanName,
			trace.WithSpanKind(trace.SpanKindServer),
			trace.WithAttributes(
				attribute.String("http.method", c.Method()),
				attribute.String("http.path", c.Path()),
				attribute.String("http.url", c.OriginalURL()),
				attribute.String("http.ip", c.IP()),
				attribute.String("http.user_agent", c.Get("User-Agent")),
			),
		)
		defer span.End()

		// Store trace info in Fiber locals
		c.Locals("traceID", span.SpanContext().TraceID().String())
		c.Locals("spanID", span.SpanContext().SpanID().String())

		// Set span attributes from context if they exist
		if requestID := c.Locals("requestid"); requestID != nil {
			span.SetAttributes(attribute.String("request.id", fmt.Sprintf("%v", requestID)))
		}

		// Inject trace ID into response headers
		c.Set("X-Trace-ID", span.SpanContext().TraceID().String())

		// Update context with span
		c.SetUserContext(ctx)

		// Proceed to next handler
		err := c.Next()

		// Record result
		span.SetAttributes(attribute.Int("http.status_code", c.Response().StatusCode()))
		if err != nil {
			span.RecordError(err)
			span.SetAttributes(attribute.String("error", err.Error()))
		}

		// Add UserID if available after auth middleware
		if userID := c.Locals("userID"); userID != nil {
			span.SetAttributes(attribute.String("user.id", fmt.Sprintf("%v", userID)))
		}

		return err
	}
}
