//go:build integration

package test

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"sanctum/internal/models"
	"sanctum/internal/seed"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type pgEnv struct {
	host string
	port string
	user string
	pass string
}

func getEnvOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func readPGEnv() pgEnv {
	env := pgEnv{
		// Default to localhost and the mapped test port so local `make test-backend`
		// can connect to the docker-managed test database. Environment variables
		// (or CI settings) can still override these values.
		host: getEnvOrDefault("DB_HOST", "localhost"),
		port: getEnvOrDefault("DB_PORT", "5433"),
		user: getEnvOrDefault("DB_USER", "sanctum_user"),
		pass: getEnvOrDefault("DB_PASSWORD", "sanctum_password"),
	}
	return env
}

func maintenanceDSN(cfg pgEnv, dbName string) string {
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", cfg.user, cfg.pass, cfg.host, cfg.port, dbName)
}

func createEphemeralDB(t *testing.T) (pgEnv, string) {
	t.Helper()
	cfg := readPGEnv()
	dbName := fmt.Sprintf("sanctum_mig_%d", time.Now().UnixNano())

	sqlDB, err := sql.Open("pgx", maintenanceDSN(cfg, "postgres"))
	if err != nil {
		t.Fatalf("open maintenance db: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	if _, err := sqlDB.ExecContext(context.Background(), `CREATE DATABASE `+dbName); err != nil {
		t.Fatalf("create ephemeral db: %v", err)
	}

	t.Cleanup(func() {
		_, _ = sqlDB.ExecContext(context.Background(), `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, dbName)
		_, _ = sqlDB.ExecContext(context.Background(), `DROP DATABASE IF EXISTS `+dbName)
	})

	return cfg, dbName
}

func openEphemeralGorm(t *testing.T, cfg pgEnv, dbName string) *gorm.DB {
	t.Helper()
	dsn := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable", cfg.host, cfg.port, cfg.user, cfg.pass, dbName)
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open gorm db: %v", err)
	}
	return db
}

// runAutoMigrate applies the same GORM AutoMigrate model set as internal/database.Connect (non-production).
func runAutoMigrate(t *testing.T, db *gorm.DB) {
	t.Helper()
	err := db.AutoMigrate(
		&models.User{},
		&models.Post{},
		&models.Comment{},
		&models.Like{},
		&models.Conversation{},
		&models.Message{},
		&models.ConversationParticipant{},
		&models.Friendship{},
		&models.GameRoom{},
		&models.GameMove{},
		&models.GameStats{},
		&models.Stream{},
		&models.StreamMessage{},
		&models.Sanctum{},
		&models.SanctumRequest{},
		&models.SanctumMembership{},
	)
	if err != nil {
		t.Fatalf("auto migrate: %v", err)
	}
	// Manual migration: opponent_id nullable (matches internal/database)
	_ = db.Exec("ALTER TABLE game_rooms ALTER COLUMN opponent_id DROP NOT NULL")
}

func TestMigrationsApplyFreshDB(t *testing.T) {
	cfg, dbName := createEphemeralDB(t)
	db := openEphemeralGorm(t, cfg, dbName)
	runAutoMigrate(t, db)

	tables := []string{"sanctums", "sanctum_requests", "sanctum_memberships"}
	for _, table := range tables {
		var exists bool
		if err := db.Raw(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name = ?)`, table).Scan(&exists).Error; err != nil {
			t.Fatalf("check table %s: %v", table, err)
		}
		if !exists {
			t.Fatalf("expected table %s to exist", table)
		}
	}
}

func TestSanctumSeedIdempotent(t *testing.T) {
	_, db := newSanctumTestAppWithDB(t)

	if err := seed.Sanctums(db); err != nil {
		t.Fatalf("first seed: %v", err)
	}
	if err := seed.Sanctums(db); err != nil {
		t.Fatalf("second seed: %v", err)
	}

	for _, builtIn := range seed.BuiltInSanctums {
		var sanctum models.Sanctum
		if err := db.Where("slug = ?", builtIn.Slug).First(&sanctum).Error; err != nil {
			t.Fatalf("missing built-in sanctum %q: %v", builtIn.Slug, err)
		}

		var convCount int64
		if err := db.Model(&models.Conversation{}).Where("sanctum_id = ?", sanctum.ID).Count(&convCount).Error; err != nil {
			t.Fatalf("count conversations for sanctum %q: %v", builtIn.Slug, err)
		}
		if convCount != 1 {
			t.Fatalf("expected exactly one conversation for %q, got %d", builtIn.Slug, convCount)
		}
	}
}
