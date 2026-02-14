//go:build integration

package seed

import (
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"sanctum/internal/config"
	"sanctum/internal/database"
	"sanctum/internal/models"
)

func parseDatabaseURLToConfig(dsn string) (*config.Config, error) {
	u, err := url.Parse(dsn)
	if err != nil {
		return nil, err
	}
	password := ""
	if u.User != nil {
		password, _ = u.User.Password()
	}
	host := u.Hostname()
	port := u.Port()
	if port == "" {
		port = "5432"
	}
	dbname := strings.TrimPrefix(u.Path, "/")
	cfg := &config.Config{
		DBHost:       host,
		DBPort:       port,
		DBUser:       u.User.Username(),
		DBPassword:   password,
		DBName:       dbname,
		DBSSLMode:    "disable",
		Env:          "test",
		DBSchemaMode: "auto",
	}
	return cfg, nil
}

func TestIntegration_SeedSanctumsAuto(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping integration seed test")
	}
	cfg, err := parseDatabaseURLToConfig(dsn)
	if err != nil {
		t.Fatalf("failed parse dsn: %v", err)
	}
	// connect and apply schema
	db, err := database.ConnectWithOptions(cfg, database.ConnectOptions{ApplySchema: true})
	if err != nil {
		t.Fatalf("db connect failed: %v", err)
	}
	if truncateErr := database.TruncateAllTables(db); truncateErr != nil {
		t.Fatalf("truncate failed: %v", truncateErr)
	}

	seed := NewSeeder(db, Options{SkipBcrypt: true, BatchSize: 50, MaxDays: 30})
	users, meshErr := seed.SeedSocialMesh(10)
	if meshErr != nil {
		t.Fatalf("SeedSocialMesh failed: %v", meshErr)
	}
	if distErr := seed.SeedSanctumsWithDistribution(users, 5); distErr != nil {
		t.Fatalf("SeedSanctumsWithDistribution failed: %v", distErr)
	}

	// give DB some time for async writes (if any)
	time.Sleep(500 * time.Millisecond)

	// basic validation: ensure posts exist
	var cnt int64
	err = db.Model(&models.Post{}).Count(&cnt).Error
	if err != nil {
		t.Fatalf("count query failed: %v", err)
	}
	if cnt == 0 {
		t.Fatalf("expected seeded posts, got 0")
	}
}
