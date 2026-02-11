// Package database handles database connections and migrations.
package database

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"sanctum/internal/config"
	"sanctum/internal/middleware"
	"sanctum/internal/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// DB is the global database connection instance.
var DB *gorm.DB

// CustomGormLogger integrates GORM with slog
type CustomGormLogger struct {
	logger *slog.Logger
	Config logger.Config
}

// LogMode sets the logging level and returns a new interface instance.
func (l *CustomGormLogger) LogMode(level logger.LogLevel) logger.Interface {
	newlogger := *l
	newlogger.Config.LogLevel = level
	return &newlogger
}

// Info logs an informational message with context.
func (l *CustomGormLogger) Info(ctx context.Context, msg string, data ...interface{}) {
	if l.Config.LogLevel >= logger.Info {
		l.logger.InfoContext(ctx, fmt.Sprintf(msg, data...))
	}
}

// Warn logs a warning message with context.
func (l *CustomGormLogger) Warn(ctx context.Context, msg string, data ...interface{}) {
	if l.Config.LogLevel >= logger.Warn {
		l.logger.WarnContext(ctx, fmt.Sprintf(msg, data...))
	}
}

func (l *CustomGormLogger) Error(ctx context.Context, msg string, data ...interface{}) {
	if l.Config.LogLevel >= logger.Error {
		l.logger.ErrorContext(ctx, fmt.Sprintf(msg, data...))
	}
}

// Trace logs trace-level information including SQL queries and execution time.
func (l *CustomGormLogger) Trace(ctx context.Context, begin time.Time, fc func() (string, int64), err error) {
	if l.Config.LogLevel <= logger.Silent {
		return
	}

	elapsed := time.Since(begin)
	sql, rows := fc()

	switch {
	case err != nil && l.Config.LogLevel >= logger.Error && !errors.Is(err, gorm.ErrRecordNotFound):
		l.logger.ErrorContext(ctx, "GORM query error",
			slog.String("sql", sql),
			slog.Int64("rows", rows),
			slog.Duration("elapsed", elapsed),
			slog.String("error", err.Error()),
		)
	case elapsed > l.Config.SlowThreshold && l.Config.SlowThreshold != 0 && l.Config.LogLevel >= logger.Warn:
		l.logger.WarnContext(ctx, "GORM slow query",
			slog.String("sql", sql),
			slog.Int64("rows", rows),
			slog.Duration("elapsed", elapsed),
		)
	case l.Config.LogLevel >= logger.Info:
		l.logger.InfoContext(ctx, "GORM query",
			slog.String("sql", sql),
			slog.Int64("rows", rows),
			slog.Duration("elapsed", elapsed),
		)
	}
}

// Connect opens a database connection using the provided configuration and returns the gorm DB instance.
func Connect(cfg *config.Config) (*gorm.DB, error) {
	var err error

	// Build PostgreSQL connection string
	sslMode := cfg.DBSSLMode
	if sslMode == "" {
		sslMode = "disable"
	}
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		cfg.DBHost,
		cfg.DBPort,
		cfg.DBUser,
		cfg.DBPassword,
		cfg.DBName,
		sslMode,
	)

	// Custom GORM logger that uses slog and ignores ErrRecordNotFound
	gormLogger := &CustomGormLogger{
		logger: middleware.Logger,
		Config: logger.Config{
			SlowThreshold:             200 * time.Millisecond,
			LogLevel:                  logger.Warn,
			IgnoreRecordNotFoundError: true,
			Colorful:                  false,
		},
	}

	dbInstance, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: gormLogger,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	middleware.Logger.Info("Database connected successfully")

	isProduction := cfg.Env == "production" || cfg.Env == "prod"
	if !isProduction {
		// Keep AutoMigrate in non-production for developer/test ergonomics.
		err = dbInstance.AutoMigrate(
			&models.User{},
			&models.Post{},
			&models.Comment{},
			&models.Like{},
			&models.Conversation{},
			&models.Message{},
			&models.ConversationParticipant{},
			&models.Friendship{},
			&models.GameRoom{},
			&models.GameMove{},
			&models.GameStats{},
			&models.Stream{},
			&models.StreamMessage{},
			&models.Sanctum{},
			&models.SanctumRequest{},
			&models.SanctumMembership{},
		)
		if err != nil {
			return nil, fmt.Errorf("failed to migrate database: %w", err)
		}

		// Manual migration: Ensure opponent_id is nullable (GORM sometimes misses dropping NOT NULL)
		if migrateErr := dbInstance.Exec("ALTER TABLE game_rooms ALTER COLUMN opponent_id DROP NOT NULL").Error; migrateErr != nil {
			middleware.Logger.Warn("Failed to drop NOT NULL constraint on game_rooms.opponent_id (ignoring as it likely already is dropped)", slog.String("error", migrateErr.Error()))
		}

		middleware.Logger.Info("Database migration completed")
	}

	// Set connection pooling parameters
	sqlDB, err := dbInstance.DB()
	if err == nil {
		sqlDB.SetMaxOpenConns(25)
		sqlDB.SetMaxIdleConns(5)
		sqlDB.SetConnMaxLifetime(5 * time.Minute)
	}

	DB = dbInstance
	return DB, nil
}
