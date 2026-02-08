// Command main runs the database seeder for Sanctum.
package main

import (
	"flag"
	"log"
	"sanctum/internal/config"
	"sanctum/internal/database"
	"sanctum/internal/seed"
)

func main() {
	// Parse command line flags
	numUsers := flag.Int("users", 50, "Number of users to create")
	numPosts := flag.Int("posts", 200, "Number of posts to create")
	shouldClean := flag.Bool("clean", true, "Clean database before seeding")
	flag.Parse()

	log.Println("🌱 Database Seeder")
	log.Println("==================")
	log.Printf("Target: %d users, %d posts, clean=%v\n", *numUsers, *numPosts, *shouldClean)

	// Load configuration
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// Connect to database
	_, err = database.Connect(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Run seeder with options
	opts := seed.Options{
		NumUsers:    *numUsers,
		NumPosts:    *numPosts,
		ShouldClean: *shouldClean,
	}

	if err := seed.Seed(database.DB, opts); err != nil {
		log.Fatalf("❌ Seeding failed: %v", err)
	}

	log.Println("✨ All done! Your database is now populated with test data.")
	log.Println("📧 All test users have the password: password123")
}
