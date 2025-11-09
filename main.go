package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"
	"vibeshift/cache"
	"vibeshift/config"
	"vibeshift/database"
	"vibeshift/handlers"
	"vibeshift/middleware"
	"vibeshift/routes"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
)

func main() {
	// Load configuration
	cfg := config.LoadConfig()

	// Initialize Redis
	cache.InitRedis(cfg.RedisURL)
	defer cache.Close()

	// Initialize handlers and middleware with config
	handlers.InitAuthHandlers(cfg)
	middleware.InitMiddleware(cfg)

	// Connect to database
	database.Connect(cfg)

	// Initialize Fiber app
	app := fiber.New(fiber.Config{
		AppName: "Social Media API",
	})

	// Middleware
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
	}))

	// Setup routes
	routes.Setup(app)

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
	}()

	// Start server
	log.Printf("Server starting on port %s...", cfg.Port)
	log.Fatal(app.Listen(":" + cfg.Port))
}
