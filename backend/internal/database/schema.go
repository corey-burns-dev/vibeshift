package database

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"sanctum/internal/config"
	"sanctum/internal/middleware"

	"gorm.io/gorm"
)

const (
	SchemaModeHybrid = "hybrid"
	SchemaModeSQL    = "sql"
	SchemaModeAuto   = "auto"
)

type SchemaStatus struct {
	Mode               string
	Environment        string
	WillRunSQL         bool
	WillRunAutoMigrate bool
	AppliedVersions    []int
	PendingMigrations  []Migration
}

func isProdLikeEnv(env string) bool {
	e := strings.ToLower(strings.TrimSpace(env))
	return e == "production" || e == "prod" || e == "staging" || e == "stage"
}

func normalizedSchemaMode(cfg *config.Config) string {
	mode := strings.ToLower(strings.TrimSpace(cfg.DBSchemaMode))
	if mode == "" {
		return SchemaModeHybrid
	}
	return mode
}

func schemaPolicy(cfg *config.Config) (runSQL bool, runAuto bool, err error) {
	mode := normalizedSchemaMode(cfg)
	prodLike := isProdLikeEnv(cfg.Env)

	switch mode {
	case SchemaModeSQL:
		return true, false, nil
	case SchemaModeAuto:
		if prodLike && !cfg.DBAutoMigrateAllowDestructive {
			return false, false, fmt.Errorf("refusing DB_SCHEMA_MODE=auto in %q without DB_AUTOMIGRATE_ALLOW_DESTRUCTIVE=true", cfg.Env)
		}
		return false, true, nil
	case SchemaModeHybrid:
		return true, !prodLike, nil
	default:
		return false, false, fmt.Errorf("unsupported DB_SCHEMA_MODE %q", mode)
	}
}

func runAutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(PersistentModels()...)
}

func ApplySchema(ctx context.Context, db *gorm.DB, cfg *config.Config) error {
	runSQL, runAuto, err := schemaPolicy(cfg)
	if err != nil {
		return err
	}

	if runSQL {
		if err := RunMigrations(ctx, db); err != nil {
			return fmt.Errorf("run sql migrations: %w", err)
		}
	}

	if runAuto {
		mode := normalizedSchemaMode(cfg)
		if mode == SchemaModeAuto && cfg.DBAutoMigrateAllowDestructive {
			middleware.Logger.Warn("DB_AUTOMIGRATE_ALLOW_DESTRUCTIVE=true set for DB_SCHEMA_MODE=auto; review schema diffs before production deployment")
		}
		middleware.Logger.Info("Running GORM AutoMigrate", slog.String("mode", mode), slog.String("env", cfg.Env))
		if err := runAutoMigrate(db); err != nil {
			return fmt.Errorf("auto-migrate: %w", err)
		}
	}

	return nil
}

func GetSchemaStatus(ctx context.Context, db *gorm.DB, cfg *config.Config) (*SchemaStatus, error) {
	runSQL, runAuto, err := schemaPolicy(cfg)
	if err != nil {
		return nil, err
	}

	status := &SchemaStatus{
		Mode:               normalizedSchemaMode(cfg),
		Environment:        cfg.Env,
		WillRunSQL:         runSQL,
		WillRunAutoMigrate: runAuto,
	}

	if !runSQL {
		return status, nil
	}

	store := NewMigrationStore(db)
	applied, err := store.GetAppliedMigrations(ctx)
	if err != nil {
		return nil, err
	}
	status.AppliedVersions = applied

	appliedSet := make(map[int]bool, len(applied))
	for _, version := range applied {
		appliedSet[version] = true
	}
	for _, m := range GetMigrations() {
		if !appliedSet[m.Version] {
			status.PendingMigrations = append(status.PendingMigrations, m)
		}
	}

	return status, nil
}
