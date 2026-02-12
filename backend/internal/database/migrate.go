package database

import (
	"embed"
	"fmt"
	"log/slog"
	"path/filepath"
	"sort"
	"strings"

	"sanctum/internal/middleware"
)

type Migration struct {
	Version    int
	Name       string
	UpScript   string
	DownScript string
}

//go:embed migrations/*.sql
var migrationFS embed.FS

var migrations []Migration

func init() {
	if err := RegisterMigrations(migrationFS); err != nil {
		fmt.Printf("failed to register internal migrations: %v\n", err)
	}
}

func RegisterMigrations(efs embed.FS) error {
	entries, err := efs.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("failed to read migrations directory: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		name := entry.Name()
		if !strings.HasSuffix(name, ".up.sql") {
			continue
		}

		base := strings.TrimSuffix(name, ".up.sql")
		parts := strings.SplitN(base, "_", 2)
		if len(parts) != 2 {
			middleware.Logger.Warn("Skipping migration with invalid naming", slog.String("file", name))
			continue
		}

		var version int
		fmt.Sscanf(parts[0], "%d", &version)

		upBytes, err := efs.ReadFile(filepath.Join("migrations", name))
		if err != nil {
			return fmt.Errorf("failed to read up migration %s: %w", name, err)
		}

		downName := base + ".down.sql"
		downBytes, err := efs.ReadFile(filepath.Join("migrations", downName))
		if err != nil {
			return fmt.Errorf("failed to read down migration %s: %w", downName, err)
		}

		migrations = append(migrations, Migration{
			Version:    version,
			Name:       parts[1],
			UpScript:   string(upBytes),
			DownScript: string(downBytes),
		})
	}

	sort.Slice(migrations, func(i, j int) bool {
		return migrations[i].Version < migrations[j].Version
	})

	return nil
}

func GetMigrations() []Migration {
	return migrations
}

func GetMigrationByVersion(version int) *Migration {
	for _, m := range migrations {
		if m.Version == version {
			return &m
		}
	}
	return nil
}

func (m *Migration) String() string {
	return fmt.Sprintf("%06d_%s", m.Version, m.Name)
}
