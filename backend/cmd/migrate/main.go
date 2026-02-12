// Command migrate runs schema operations for the backend.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"strconv"
	"strings"

	"sanctum/internal/config"
	"sanctum/internal/database"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func usage() error {
	return fmt.Errorf("usage: go run ./cmd/migrate/main.go <up|auto|status|down> [version]")
}

func run() error {
	flag.Parse()
	if flag.NArg() < 1 {
		return usage()
	}

	cfg, err := config.LoadConfig()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	db, err := database.ConnectWithOptions(cfg, database.ConnectOptions{ApplySchema: false})
	if err != nil {
		return fmt.Errorf("connect database: %w", err)
	}

	ctx := context.Background()
	cmd := strings.ToLower(strings.TrimSpace(flag.Arg(0)))
	switch cmd {
	case "up":
		if err := database.RunMigrations(ctx, db); err != nil {
			return fmt.Errorf("sql migrations failed: %w", err)
		}
		log.Println("sql migrations applied")
	case "auto":
		cfg.DBSchemaMode = database.SchemaModeAuto
		if err := database.ApplySchema(ctx, db, cfg); err != nil {
			return fmt.Errorf("auto schema apply failed: %w", err)
		}
		log.Println("automigrations applied")
	case "status":
		status, err := database.GetSchemaStatus(ctx, db, cfg)
		if err != nil {
			return fmt.Errorf("schema status failed: %w", err)
		}
		log.Printf("mode=%s env=%s run_sql=%t run_auto=%t applied=%d pending=%d", status.Mode, status.Environment, status.WillRunSQL, status.WillRunAutoMigrate, len(status.AppliedVersions), len(status.PendingMigrations))
		for _, m := range status.PendingMigrations {
			log.Printf("pending: %06d_%s", m.Version, m.Name)
		}
	case "down":
		if flag.NArg() < 2 {
			return fmt.Errorf("usage: go run ./cmd/migrate/main.go down <version>")
		}
		version, err := strconv.Atoi(flag.Arg(1))
		if err != nil {
			return fmt.Errorf("invalid version %q: %w", flag.Arg(1), err)
		}
		if err := database.RollbackMigration(ctx, db, version); err != nil {
			return fmt.Errorf("rollback failed: %w", err)
		}
		log.Printf("rolled back migration %d", version)
	default:
		return usage()
	}

	return nil
}
