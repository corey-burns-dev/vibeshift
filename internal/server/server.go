package server

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"vibeshift/internal/handlers"
	"vibeshift/pkg/db"
	redispkg "vibeshift/pkg/redis"
)

// package-level constructor hooks to make the server testable. Tests may
// replace these with fakes.
var (
	// newRedisAdapter builds the RedisClient used by handlers from a raw URL.
	newRedisAdapter = func(raw string) redispkg.RedisClient {
		rc := redispkg.NewClient(raw)
		return redispkg.NewAdapter(rc)
	}

	// newDB is a hook for creating the *sql.DB. Tests can replace with a
	// function that returns (nil, nil) to avoid real DB connections.
	newDB = db.NewDB
)

// Run starts the HTTP server and blocks until a termination signal is received.
// It initializes Redis and Postgres according to environment variables and
// performs graceful shutdown.
func Run() {
	// Default behavior uses real OS signals.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	RunWithQuit(quit)
}

// RunWithQuit behaves like Run but uses the provided quit channel instead of
// listening to OS signals. This makes it easier to drive shutdown in tests.
func RunWithQuit(quit <-chan os.Signal) {
	// Get port from env or default to 8080
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Initialize Redis client from REDIS_URL using the injectable adapter.
	raw := os.Getenv("REDIS_URL")
	redisClient := newRedisAdapter(raw)

	// Initialize Postgres DB (if DATABASE_URL or env vars are set).
	database, err := newDB()
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}

	h := &handlers.Handlers{Redis: redisClient}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", h.Health)
	mux.HandleFunc("/ping", h.Ping)
	mux.Handle("/", http.NotFoundHandler())

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: mux,
	}

	// Wrap the mux with a simple CORS middleware. The frontend origin can be
	// configured via FRONTEND_ORIGIN (defaults to allow all for dev).
	frontendOrigin := os.Getenv("FRONTEND_ORIGIN")
	if frontendOrigin == "" {
		frontendOrigin = "*"
	}
	srv.Handler = corsMiddleware(mux, frontendOrigin)

	go func() {
		log.Printf("Server starting on port :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	// Wait for termination signal and gracefully shutdown
	<-quit
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	_ = redisClient.Close()
	if database != nil {
		_ = database.Close()
	}
}

// corsMiddleware is a very small CORS implementation used in dev.
func corsMiddleware(next http.Handler, origin string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
