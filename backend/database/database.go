// Package database handles database connections and migrations.
package database

import (
	"fmt"
	"log"
	"time"
	"vibeshift/config"
	"vibeshift/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// DB is the global database connection instance.
var DB *gorm.DB

// Connect opens a database connection using the provided configuration and performs
// automatic migration for the application models, then returns the gorm DB instance.
// Connect establishes a database connection using the provided configuration.
func Connect(cfg *config.Config) (*gorm.DB, error) {
	var err error

	// Build PostgreSQL connection string
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		cfg.DBHost,
		cfg.DBPort,
		cfg.DBUser,
		cfg.DBPassword,
		cfg.DBName,
	)

	dbInstance, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})

	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	log.Println("Database connected successfully")

	// Auto migrate models
	err = dbInstance.AutoMigrate(
		&models.User{},
		&models.Post{},
		&models.Comment{},
		&models.Like{},
		&models.Conversation{},
		&models.Message{},
		&models.ConversationParticipant{},
		&models.Friendship{},
	)
	if err != nil {
		return nil, fmt.Errorf("failed to migrate database: %w", err)
	}

	log.Println("Database migration completed")

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
