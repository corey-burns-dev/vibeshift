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
		log.Printf("Repository tests skipped: failed to load test config: %v", err)
		os.Exit(0)
	}

	testDB, err = database.Connect(cfg)
	if err != nil {
		log.Printf("Repository tests skipped: test database unavailable (start Postgres or use make test-backend-integration): %v", err)
		os.Exit(0)
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
	db.Exec("TRUNCATE TABLE poll_votes, poll_options, polls, images, users, posts, comments, likes, conversations, conversation_participants, friendships, game_rooms, game_moves, game_stats, sanctum_memberships, sanctum_requests, sanctums CASCADE")
}
