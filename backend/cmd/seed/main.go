// Command main runs the database seeder for Vibeshift.
package main

import (
	"log"
	"vibeshift/config"
	"vibeshift/database"
	"vibeshift/seed"
)

func main() {
	log.Println("🌱 Database Seeder")
	log.Println("==================")

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
	if err := seed.Seed(database.DB); err != nil {
		log.Fatalf("❌ Seeding failed: %v", err)
	}

	log.Println("✨ All done! Your database is now populated with test data.")
	log.Println("📧 All test users have the password: password123")
}
