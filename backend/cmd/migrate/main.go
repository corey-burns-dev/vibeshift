// Command migrate runs database migrations for the backend.
package main

import (
	"errors"
	"flag"
	"fmt"
	"log"
	"path/filepath"

	"sanctum/internal/config"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	flag.Parse()
	if flag.NArg() < 1 {
		return fmt.Errorf("usage: go run ./cmd/migrate/main.go <up|down|force|version> [force_version]")
	}

	cfg, err := config.LoadConfig()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	sslMode := cfg.DBSSLMode
	if sslMode == "" {
		sslMode = "disable"
	}
	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s", cfg.DBUser, cfg.DBPassword, cfg.DBHost, cfg.DBPort, cfg.DBName, sslMode)
	migrationsPath, err := filepath.Abs("migrations")
	if err != nil {
		return fmt.Errorf("resolve migrations path: %w", err)
	}

	m, err := migrate.New("file://"+migrationsPath, dsn)
	if err != nil {
		return fmt.Errorf("create migrate client: %w", err)
	}
	defer func() {
		_, _ = m.Close()
	}()

	switch flag.Arg(0) {
	case "up":
		err = m.Up()
		if err != nil && !errors.Is(err, migrate.ErrNoChange) {
			return fmt.Errorf("migrate up failed: %w", err)
		}
		log.Println("migrations applied")
	case "down":
		err = m.Steps(-1)
		if err != nil && !errors.Is(err, migrate.ErrNoChange) {
			return fmt.Errorf("migrate down failed: %w", err)
		}
		log.Println("rolled back one migration")
	case "force":
		if flag.NArg() < 2 {
			return fmt.Errorf("usage: go run ./cmd/migrate/main.go force <version>")
		}
		var version int
		if _, err := fmt.Sscanf(flag.Arg(1), "%d", &version); err != nil {
			return fmt.Errorf("invalid force version: %w", err)
		}
		if err := m.Force(version); err != nil {
			return fmt.Errorf("force failed: %w", err)
		}
		log.Printf("forced migration version to %d", version)
	case "version":
		version, dirty, err := m.Version()
		if err != nil {
			if errors.Is(err, migrate.ErrNilVersion) {
				log.Println("version: none")
				return nil
			}
			return fmt.Errorf("read version failed: %w", err)
		}
		log.Printf("version=%d dirty=%t", version, dirty)
	default:
		return fmt.Errorf("unknown command %q", flag.Arg(0))
	}

	return nil
}
