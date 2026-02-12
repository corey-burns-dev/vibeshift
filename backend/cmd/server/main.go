// Command main is the entry point for the Sanctum backend server.
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"sanctum/internal/bootstrap"
	"sanctum/internal/config"
	"sanctum/internal/database"
	"sanctum/internal/seed"
	"sanctum/internal/server"

	"github.com/gofiber/fiber/v2"
)

// @title Sanctum API
// @version 1.0
// @description Social media platform API with posts, comments, messaging, and friends
// @termsOfService http://swagger.io/terms/

// @contact.name API Support
// @contact.email support@sanctum.dev

// @license.name MIT
// @license.url https://opensource.org/licenses/MIT

// @host localhost:8375
// @BasePath /api
// @schemes http https

// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
// @description Type "Bearer" followed by a space and JWT token.

func main() {
	// Load configuration
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// Initialize runtime (DB, Redis) and seed built-ins for runtime startup
	db, redisClient, err := bootstrap.InitRuntime(cfg, bootstrap.Options{SeedBuiltIns: true})
	if err != nil {
		log.Fatalf("Runtime initialization failed: %v", err)
	}

	// Create server using already-initialized dependencies (no implicit seeding)
	srv, err := server.NewServerWithDeps(cfg, db, redisClient)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
	}

	// Seed built-in sanctums
	if err := seed.Sanctums(database.DB); err != nil {
		log.Printf("Warning: failed to seed built-in sanctums: %v", err)
	}

	// Initialize Fiber app
	app := fiber.New(fiber.Config{
		AppName:   "Social Media API",
		BodyLimit: 10 * 1024 * 1024, // 10MB limit
	})

	// Setup middleware and routes
	srv.SetupMiddleware(app)
	srv.SetupRoutes(app)

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan

		log.Println("Shutting down server...")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := app.ShutdownWithContext(ctx); err != nil {
			log.Printf("Server shutdown error: %v", err)
		}

		// Shutdown server resources
		if err := srv.Shutdown(ctx); err != nil {
			log.Printf("Server resource shutdown error: %v", err)
		}
	}()

	// Start server
	log.Printf("Server starting on port %s...", cfg.Port)
	log.Fatal(app.Listen(":" + cfg.Port))
}
