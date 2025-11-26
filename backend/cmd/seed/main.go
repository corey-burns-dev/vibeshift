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
	cfg := config.LoadConfig()

	// Connect to database
	database.Connect(cfg)

	// Run seeder
	if err := seed.Seed(database.DB); err != nil {
		log.Fatalf("❌ Seeding failed: %v", err)
	}

	log.Println("✨ All done! Your database is now populated with test data.")
	log.Println("📧 All test users have the password: password123")
}
