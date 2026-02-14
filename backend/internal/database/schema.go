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

// Database schema modes
const (
	SchemaModeHybrid = "hybrid"
	SchemaModeSQL    = "sql"
	SchemaModeAuto   = "auto"
)

// SchemaStatus describes the current schema management policy and migration state.
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
		return SchemaModeSQL
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

// ApplySchema executes database schema setup based on configured policy.
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
			// Some Postgres-specific errors indicate idempotency issues (object
			// already/didn't exist). Since we can't check pgconn.PgError, fallback to string matching.
			if strings.Contains(err.Error(), "does not exist") {
				// Fallback: some drivers/lib wrappers may not expose pgconn.PgError;
				// still accept the common textual message as a non-fatal issue.
				middleware.Logger.Warn("auto-migrate: non-fatal missing object (fallback)", slog.String("err", err.Error()))
			} else {
				return fmt.Errorf("auto-migrate: %w", err)
			}
		}
	}

	return nil
}

// GetSchemaStatus returns detailed information about current database schema state.
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
	if err := validateAppliedVersions(applied, GetMigrations()); err != nil {
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
