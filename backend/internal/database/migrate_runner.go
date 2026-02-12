package database

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"sanctum/internal/middleware"

	"gorm.io/gorm"
)

type MigrationStore interface {
	GetAppliedMigrations(ctx context.Context) ([]int, error)
	ApplyMigration(ctx context.Context, version int, name, sql string) error
	RemoveMigration(ctx context.Context, version int) error
}

type migrationStore struct {
	db *gorm.DB
}

type MigrationLog struct {
	Version   int       `gorm:"primaryKey;autoIncrement:false"`
	Name      string    `gorm:"size:255"`
	AppliedAt time.Time `gorm:"autoCreateTime"`
}

func (MigrationLog) TableName() string {
	return "migration_logs"
}

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

func RunMigrations(ctx context.Context, db *gorm.DB) error {
	// Ensure migration_logs table exists
	if err := db.WithContext(ctx).AutoMigrate(&MigrationLog{}); err != nil {
		return fmt.Errorf("failed to auto-migrate migration_logs: %w", err)
	}

	store := NewMigrationStore(db)
	applied, err := store.GetAppliedMigrations(ctx)
	if err != nil {
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
	if err := store.RemoveMigration(ctx, version); err != nil {
		return err
	}

	return nil
}
