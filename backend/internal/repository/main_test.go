package repository

import (
	"log"
	"os"
	"testing"

	"sanctum/internal/config"
	"sanctum/internal/database"

	"gorm.io/gorm"
)

var testDB *gorm.DB

func TestMain(m *testing.M) {
	// Set environment to test
	os.Setenv("APP_ENV", "test")

	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load test config: %v", err)
	}

	testDB, err = database.Connect(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to test database: %v", err)
	}

	// Run tests
	code := m.Run()

	// Cleanup if needed (truncate tables)
	truncateTables(testDB)

	os.Exit(code)
}

func truncateTables(db *gorm.DB) {
	// Simple cleanup between runs if desired,
	// though usually we use transactions or fresh IDs in tests.
	db.Exec("TRUNCATE TABLE users, posts, comments, likes, conversations, conversation_participants, friendships CASCADE")
}
