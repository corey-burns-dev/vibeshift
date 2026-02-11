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
	preset := flag.String("preset", "", "Apply a specific seeder preset (e.g., MegaPopulated)")
	flag.Parse()

	log.Println("🌱 Database Seeder")
	log.Println("==================")

	if *preset != "" {
		log.Printf("Applying preset: %s (ignoring other flags)\n", *preset)
	} else {
		log.Printf("Target: %d users, %d posts, clean=%v\n", *numUsers, *numPosts, *shouldClean)
	}

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

	// Run seeder
	s := seed.NewSeeder(database.DB)

	if *shouldClean {
		if err := s.ClearAll(); err != nil {
			log.Fatalf("❌ Cleanup failed: %v", err)
		}
	}

	if err := seed.Sanctums(database.DB); err != nil {
		log.Fatalf("❌ Built-in sanctum seeding failed: %v", err)
	}

	if *preset != "" {
		if err := s.ApplyPreset(*preset); err != nil {
			log.Fatalf("❌ Preset seeding failed: %v", err)
		}
	} else {
		users, err := s.SeedSocialMesh(*numUsers)
		if err != nil {
			log.Fatalf("❌ User seeding failed: %v", err)
		}
		_, err = s.SeedEngagement(users, *numPosts)
		if err != nil {
			log.Fatalf("❌ Engagement seeding failed: %v", err)
		}
	}

	log.Println("✨ All done! Your database is now populated with test data.")
	log.Println("📧 All test users have the password: password123")
}
