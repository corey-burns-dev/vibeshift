package database

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"time"

	"sanctum/internal/middleware"

	"gorm.io/gorm"
)

// MigrationStore defines the interface for tracking and applying migrations.
type MigrationStore interface {
	GetAppliedMigrations(ctx context.Context) ([]int, error)
	ApplyMigration(ctx context.Context, version int, name, sql string) error
	RemoveMigration(ctx context.Context, version int) error
}

type migrationStore struct {
	db *gorm.DB
}

// MigrationLog represents a record of an applied migration in the database.
type MigrationLog struct {
	Version   int       `gorm:"primaryKey;autoIncrement:false"`
	Name      string    `gorm:"size:255"`
	AppliedAt time.Time `gorm:"autoCreateTime"`
}

// TableName returns the database table name for MigrationLog.
func (MigrationLog) TableName() string {
	return "migration_logs"
}

// NewMigrationStore creates a new MigrationStore instance.
func NewMigrationStore(db *gorm.DB) MigrationStore {
	return &migrationStore{db: db}
}

func (s *migrationStore) GetAppliedMigrations(ctx context.Context) ([]int, error) {
	var versions []int
	if err := s.db.WithContext(ctx).Model(&MigrationLog{}).Order("version ASC").Pluck("version", &versions).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) || isMissingTableError(err) {
			return []int{}, nil
		}
		return nil, fmt.Errorf("failed to get applied migrations: %w", err)
	}
	return versions, nil
}

func isMissingTableError(err error) bool {
	return strings.Contains(err.Error(), "relation") && strings.Contains(err.Error(), "does not exist")
}

func (s *migrationStore) ApplyMigration(ctx context.Context, version int, name, sql string) error {
	if err := s.db.WithContext(ctx).Exec(sql).Error; err != nil {
		return fmt.Errorf("failed to apply migration %d (%s): %w", version, name, err)
	}

	log := MigrationLog{
		Version: version,
		Name:    name,
	}
	if err := s.db.WithContext(ctx).Create(&log).Error; err != nil {
		return fmt.Errorf("failed to record migration %d: %w", version, err)
	}

	middleware.Logger.Info("Migration applied", slog.Int("version", version), slog.String("name", name))
	return nil
}

func (s *migrationStore) RemoveMigration(ctx context.Context, version int) error {
	if err := s.db.WithContext(ctx).Where("version = ?", version).Delete(&MigrationLog{}).Error; err != nil {
		return fmt.Errorf("failed to remove migration record %d: %w", version, err)
	}
	middleware.Logger.Info("Migration rolled back", slog.Int("version", version))
	return nil
}

// RunMigrations ensures the migration log table exists and applies all pending migrations.
func RunMigrations(ctx context.Context, db *gorm.DB) error {
	const ensureMigrationLogTableSQL = `
CREATE TABLE IF NOT EXISTS migration_logs (
	version BIGINT PRIMARY KEY,
	name VARCHAR(255) NOT NULL,
	applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_migration_logs_applied_at ON migration_logs (applied_at);`
	if err := db.WithContext(ctx).Exec(ensureMigrationLogTableSQL).Error; err != nil {
		return fmt.Errorf("failed to ensure migration logs table: %w", err)
	}

	store := NewMigrationStore(db)
	applied, err := store.GetAppliedMigrations(ctx)
	if err != nil {
		return err
	}
	if err := validateAppliedVersions(applied, migrations); err != nil {
		return err
	}

	appliedSet := make(map[int]bool)
	for _, v := range applied {
		appliedSet[v] = true
	}

	for _, m := range migrations {
		if appliedSet[m.Version] {
			middleware.Logger.Debug("Migration already applied", slog.Int("version", m.Version), slog.String("name", m.Name))
			continue
		}

		middleware.Logger.Info("Applying migration", slog.Int("version", m.Version), slog.String("name", m.Name))
		if err := store.ApplyMigration(ctx, m.Version, m.Name, m.UpScript); err != nil {
			return err
		}
	}

	return nil
}

func validateAppliedVersions(applied []int, registered []Migration) error {
	if len(applied) == 0 {
		return nil
	}
	known := make(map[int]struct{}, len(registered))
	for _, m := range registered {
		known[m.Version] = struct{}{}
	}

	var unknown []int
	for _, version := range applied {
		if _, ok := known[version]; !ok {
			unknown = append(unknown, version)
		}
	}
	if len(unknown) == 0 {
		return nil
	}

	sort.Ints(unknown)
	parts := make([]string, 0, len(unknown))
	for _, version := range unknown {
		parts = append(parts, fmt.Sprintf("%06d", version))
	}
	return fmt.Errorf(
		"migration_logs contains unknown versions not present in code: %s (run make db-reset-dev in development to rebuild)",
		strings.Join(parts, ", "),
	)
}

// RollbackMigration reverts a specific migration by version number.
func RollbackMigration(ctx context.Context, db *gorm.DB, version int) error {
	store := NewMigrationStore(db)
	m := GetMigrationByVersion(version)
	if m == nil {
		return fmt.Errorf("migration version %d not found", version)
	}

	applied, err := store.GetAppliedMigrations(ctx)
	if err != nil {
		return err
	}

	found := false
	for _, v := range applied {
		if v == version {
			found = true
			break
		}
	}

	if !found {
		return fmt.Errorf("migration %d has not been applied", version)
	}

	middleware.Logger.Info("Rolling back migration", slog.Int("version", version), slog.String("name", m.Name))
	if err := db.WithContext(ctx).Exec(m.DownScript).Error; err != nil {
		return fmt.Errorf("failed to run rollback SQL for migration %d (%s): %w", version, m.Name, err)
	}
	return store.RemoveMigration(ctx, version)
}
