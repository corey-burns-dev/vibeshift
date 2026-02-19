//go:build integration

package test

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"sanctum/internal/config"
	"sanctum/internal/database"
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

func runMigrations(t *testing.T, cfg pgEnv, dbName string) {
	t.Helper()
	db := openEphemeralGorm(t, cfg, dbName)
	if err := database.RunMigrations(context.Background(), db); err != nil {
		t.Fatalf("run migrations: %v", err)
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

func runSchemaMode(t *testing.T, db *gorm.DB, env, mode string) {
	t.Helper()
	cfg := &config.Config{
		Env:                           env,
		DBSchemaMode:                  mode,
		DBAutoMigrateAllowDestructive: false,
	}
	if err := database.ApplySchema(context.Background(), db, cfg); err != nil {
		t.Fatalf("apply schema (%s/%s): %v", env, mode, err)
	}
}

func TestMigrationsApplyFreshDB(t *testing.T) {
	cfg, dbName := createEphemeralDB(t)
	runMigrations(t, cfg, dbName)
	db := openEphemeralGorm(t, cfg, dbName)

	tables := []string{
		"users",
		"posts",
		"polls",
		"poll_options",
		"poll_votes",
		"images",
		"sanctums",
		"sanctum_requests",
		"sanctum_memberships",
		"chatroom_moderators",
	}
	for _, table := range tables {
		var exists bool
		if err := db.Raw(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name = ?)`, table).Scan(&exists).Error; err != nil {
			t.Fatalf("check table %s: %v", table, err)
		}
		if !exists {
			t.Fatalf("expected table %s to exist", table)
		}
	}

	// Verify Foreign Key constraint: fk_conversations_sanctum
	var fkExists bool
	fkQuery := `
		SELECT EXISTS (
			SELECT 1 
			FROM information_schema.table_constraints 
			WHERE constraint_name = 'fk_conversations_sanctum' 
			AND table_name = 'conversations'
		)`
	if err := db.Raw(fkQuery).Scan(&fkExists).Error; err != nil {
		t.Fatalf("check FK fk_conversations_sanctum: %v", err)
	}
	if !fkExists {
		t.Error("expected foreign key constraint 'fk_conversations_sanctum' to exist")
	}

	// Verify Unique Index: idx_conversations_sanctum_id_unique
	var indexExists bool
	indexQuery := `
		SELECT EXISTS (
			SELECT 1 
			FROM pg_indexes 
			WHERE indexname = 'idx_conversations_sanctum_id_unique' 
			AND tablename = 'conversations'
		)`
	if err := db.Raw(indexQuery).Scan(&indexExists).Error; err != nil {
		t.Fatalf("check unique index idx_conversations_sanctum_id_unique: %v", err)
	}
	if !indexExists {
		t.Error("expected unique index 'idx_conversations_sanctum_id_unique' to exist")
	}

	var legacyTableExists bool
	if err := db.Raw(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='sancta')`).Scan(&legacyTableExists).Error; err != nil {
		t.Fatalf("check legacy sancta table: %v", err)
	}
	if legacyTableExists {
		t.Fatal("legacy table sancta should not exist")
	}

	var nullable string
	if err := db.Raw(`
SELECT is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='game_rooms' AND column_name='opponent_id'`).
		Scan(&nullable).Error; err != nil {
		t.Fatalf("check game_rooms.opponent_id nullability: %v", err)
	}
	if nullable != "YES" {
		t.Fatalf("expected game_rooms.opponent_id to be nullable, got %q", nullable)
	}

	// Verify post polymorphic fields and post_type constraint.
	postColumns := []string{"post_type", "link_url", "youtube_url"}
	for _, column := range postColumns {
		var exists bool
		if err := db.Raw(`
SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='posts' AND column_name = ?
)`, column).Scan(&exists).Error; err != nil {
			t.Fatalf("check posts.%s column: %v", column, err)
		}
		if !exists {
			t.Fatalf("expected posts.%s to exist", column)
		}
	}

	var postTypeCheckExists bool
	if err := db.Raw(`
SELECT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_posts_post_type'
)`).Scan(&postTypeCheckExists).Error; err != nil {
		t.Fatalf("check post_type constraint: %v", err)
	}
	if !postTypeCheckExists {
		t.Fatal("expected chk_posts_post_type constraint to exist")
	}

	// Verify poll vote uniqueness and image lookup indexes.
	var pollVoteUniqueExists bool
	if err := db.Raw(`
SELECT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_poll_votes_user_poll'
)`).Scan(&pollVoteUniqueExists).Error; err != nil {
		t.Fatalf("check poll vote unique constraint: %v", err)
	}
	if !pollVoteUniqueExists {
		t.Fatal("expected uq_poll_votes_user_poll constraint to exist")
	}

	for _, idx := range []string{"uq_images_hash", "idx_images_user", "idx_images_user_uploaded_at", "idx_images_uploaded_at"} {
		var exists bool
		if err := db.Raw(`
	SELECT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE tablename = 'images' AND indexname = ?
)`, idx).Scan(&exists).Error; err != nil {
			t.Fatalf("check %s index: %v", idx, err)
		}
		if !exists {
			t.Fatalf("expected %s index to exist", idx)
		}
	}
}

func TestSchemaModeHybridIsIdempotent(t *testing.T) {
	cfg, dbName := createEphemeralDB(t)
	db := openEphemeralGorm(t, cfg, dbName)

	runSchemaMode(t, db, "test", database.SchemaModeHybrid)
	runSchemaMode(t, db, "test", database.SchemaModeHybrid)

	status, err := database.GetSchemaStatus(context.Background(), db, &config.Config{
		Env:          "test",
		DBSchemaMode: database.SchemaModeHybrid,
	})
	if err != nil {
		t.Fatalf("schema status: %v", err)
	}
	if len(status.PendingMigrations) != 0 {
		t.Fatalf("expected no pending migrations, got %d", len(status.PendingMigrations))
	}
}

func TestSchemaModeHybridProdSkipsAutoMigrate(t *testing.T) {
	cfg, dbName := createEphemeralDB(t)
	db := openEphemeralGorm(t, cfg, dbName)

	status, err := database.GetSchemaStatus(context.Background(), db, &config.Config{
		Env:          "production",
		DBSchemaMode: database.SchemaModeHybrid,
	})
	if err != nil {
		t.Fatalf("schema status: %v", err)
	}
	if status.WillRunAutoMigrate {
		t.Fatal("expected auto-migrate to be disabled for production hybrid mode")
	}

	runSchemaMode(t, db, "production", database.SchemaModeHybrid)
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
