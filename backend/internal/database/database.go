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

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB
var ReadDB *gorm.DB

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
		middleware.DatabaseErrors.WithLabelValues("query").Inc()
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

func buildDSN(cfg *config.Config, read bool) string {
	sslMode := cfg.DBSSLMode
	if sslMode == "" {
		sslMode = "disable"
	}

	if read {
		host := cfg.DBReadHost
		if host == "" {
			host = cfg.DBHost
		}
		port := cfg.DBReadPort
		if port == "" {
			port = cfg.DBPort
		}
		user := cfg.DBReadUser
		if user == "" {
			user = cfg.DBUser
		}
		password := cfg.DBReadPassword
		if password == "" {
			password = cfg.DBPassword
		}
		return fmt.Sprintf(
			"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
			host, port, user, password, cfg.DBName, sslMode,
		)
	}

	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName, sslMode,
	)
}

func newDBInstance(dsn string, cfg *config.Config) (*gorm.DB, error) {
	gormLogger := &CustomGormLogger{
		logger: middleware.Logger,
		Config: logger.Config{
			SlowThreshold:             200 * time.Millisecond,
			LogLevel:                  logger.Warn,
			IgnoreRecordNotFoundError: true,
			Colorful:                  false,
		},
	}

	return gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: gormLogger,
	})
}

func configurePool(db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(5)
	sqlDB.SetConnMaxLifetime(5 * time.Minute)
	return nil
}

// GetReadDB returns the read replica database instance, falling back to primary if read replica is not configured.
func GetReadDB() *gorm.DB {
	if ReadDB != nil {
		return ReadDB
	}
	if DB != nil {
		return DB
	}
	return nil
}

// TruncateAllTables clears all data from application tables.
func TruncateAllTables(db *gorm.DB) error {
	sql := `TRUNCATE TABLE comments, likes, posts, conversation_participants, messages, conversations, sanctum_memberships, sanctum_requests, sanctums, stream_messages, streams, users, friendships, game_rooms, game_moves RESTART IDENTITY CASCADE;`
	return db.Exec(sql).Error
}

// Connect opens database connections for read/write and optionally read replica.
func Connect(cfg *config.Config) (*gorm.DB, error) {
	var err error
	ctx := context.Background()

	writeDSN := buildDSN(cfg, false)
	DB, err = newDBInstance(writeDSN, cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to primary database: %w", err)
	}
	middleware.Logger.Info("Primary database connected successfully")

	if cfg.DBReadHost != "" {
		readDSN := buildDSN(cfg, true)
		ReadDB, err = newDBInstance(readDSN, cfg)
		if err != nil {
			middleware.Logger.Warn("Failed to connect to read replica, falling back to primary", slog.String("error", err.Error()))
			ReadDB = nil
		} else {
			middleware.Logger.Info("Read replica connected successfully")
			if err := configurePool(ReadDB); err != nil {
				middleware.Logger.Warn("Failed to configure read replica pool", slog.String("error", err.Error()))
			}
		}
	}

	if err := configurePool(DB); err != nil {
		return nil, fmt.Errorf("failed to configure database pool: %w", err)
	}

	if err := RunMigrations(ctx, DB); err != nil {
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	if migrateErr := DB.Exec("ALTER TABLE game_rooms ALTER COLUMN opponent_id DROP NOT NULL").Error; migrateErr != nil {
		middleware.Logger.Warn("Failed to drop NOT NULL constraint on game_rooms.opponent_id", slog.String("error", migrateErr.Error()))
	}

	middleware.Logger.Info("Database migrations completed")
	return DB, nil
}
