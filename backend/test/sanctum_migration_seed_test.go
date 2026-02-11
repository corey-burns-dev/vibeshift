package test

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"sanctum/internal/database"
	"sanctum/internal/models"
	"sanctum/internal/seed"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
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
		host: getEnvOrDefault("DB_HOST", "localhost"),
		port: getEnvOrDefault("DB_PORT", "5432"),
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

func runMigrations(t *testing.T, cfg pgEnv, dbName string) {
	t.Helper()
	bootstrapDB := openEphemeralGorm(t, cfg, dbName)
	if err := bootstrapDB.AutoMigrate(&models.User{}, &models.Conversation{}); err != nil {
		t.Fatalf("bootstrap core tables: %v", err)
	}

	migrationsPath, err := filepath.Abs("../migrations")
	if err != nil {
		t.Fatalf("resolve migrations path: %v", err)
	}

	m, err := migrate.New("file://"+migrationsPath, maintenanceDSN(cfg, dbName))
	if err != nil {
		t.Fatalf("create migrate client: %v", err)
	}
	t.Cleanup(func() {
		_, _ = m.Close()
	})

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		t.Fatalf("run migrations up: %v", err)
	}
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

func TestMigrationsApplyFreshDB(t *testing.T) {
	cfg, dbName := createEphemeralDB(t)
	runMigrations(t, cfg, dbName)

	db := openEphemeralGorm(t, cfg, dbName)

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

	var sanctumFKExists bool
	if err := db.Raw(`SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_conversations_sanctum')`).Scan(&sanctumFKExists).Error; err != nil {
		t.Fatalf("check conversations sanctum fk: %v", err)
	}
	if !sanctumFKExists {
		t.Fatal("expected fk_conversations_sanctum constraint")
	}

	var uniqueIdxExists bool
	if err := db.Raw(`SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='conversations' AND indexname='idx_conversations_sanctum_id_unique')`).Scan(&uniqueIdxExists).Error; err != nil {
		t.Fatalf("check unique sanctum conversation index: %v", err)
	}
	if !uniqueIdxExists {
		t.Fatal("expected idx_conversations_sanctum_id_unique index")
	}
}

func TestSanctumSeedIdempotent(t *testing.T) {
	_ = newSanctumTestApp(t)
	db := database.DB

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
