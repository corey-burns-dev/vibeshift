package bootstrap

import (
	"errors"
	"fmt"
	"log"
	"strings"

	"sanctum/internal/cache"
	"sanctum/internal/config"
	"sanctum/internal/database"
	"sanctum/internal/models"
	"sanctum/internal/seed"

	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// Options control runtime initialization behavior.
type Options struct {
	SeedBuiltIns bool
}

// InitRuntime connects to DB and Redis and optionally runs built-in seeding.
func InitRuntime(cfg *config.Config, opts Options) (*gorm.DB, *redis.Client, error) {
	// Connect DB
	db, err := database.Connect(cfg)
	if err != nil {
		return nil, nil, fmt.Errorf("database connection failed: %w", err)
	}

	// Init Redis (may result in nil client if unreachable)
	cache.InitRedis(cfg.RedisURL)
	r := cache.GetClient()

	if err := ensureDevRootAdmin(cfg, db); err != nil {
		return nil, nil, fmt.Errorf("failed to bootstrap development root admin: %w", err)
	}

	if opts.SeedBuiltIns {
		if err := seed.Sanctums(db); err != nil {
			return nil, nil, fmt.Errorf("failed to seed built-in sanctums: %w", err)
		}
	}

	return db, r, nil
}

func ensureDevRootAdmin(cfg *config.Config, db *gorm.DB) error {
	if cfg == nil || db == nil {
		return nil
	}
	if !strings.EqualFold(cfg.Env, "development") || !cfg.DevBootstrapRoot {
		return nil
	}

	username := strings.TrimSpace(cfg.DevRootUsername)
	if username == "" {
		username = "sanctum_root"
	}
	email := strings.TrimSpace(strings.ToLower(cfg.DevRootEmail))
	if email == "" {
		email = "root@sanctum.local"
	}
	password := cfg.DevRootPassword
	if password == "" {
		return fmt.Errorf("DEV_ROOT_PASSWORD must be set when DEV_BOOTSTRAP_ROOT is enabled")
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash root password: %w", err)
	}

	if err := db.Transaction(func(tx *gorm.DB) error {
		var root models.User
		findErr := tx.First(&root, 1).Error
		switch {
		case errors.Is(findErr, gorm.ErrRecordNotFound):
			root = models.User{
				ID:       1,
				Username: username,
				Email:    email,
				Password: string(hashedPassword),
				IsAdmin:  true,
			}
			if err := tx.Create(&root).Error; err != nil {
				return err
			}
		case findErr != nil:
			return findErr
		default:
			updates := map[string]any{"is_admin": true}
			if cfg.DevRootForceCredentials {
				updates["username"] = username
				updates["email"] = email
				updates["password"] = string(hashedPassword)
			}
			if err := tx.Model(&models.User{}).Where("id = ?", 1).Updates(updates).Error; err != nil {
				return err
			}
		}

		// Ensure users ID sequence is not behind explicit ID insertion.
		// This is PostgreSQL-specific.
		if tx.Dialector.Name() == "postgres" {
			if err := tx.Exec(`
				SELECT setval(
					pg_get_serial_sequence('users', 'id'),
					GREATEST((SELECT COALESCE(MAX(id), 1) FROM users), 1),
					true
				)
			`).Error; err != nil {
				return fmt.Errorf("failed to reset users sequence: %w", err)
			}
		}

		return nil
	}); err != nil {
		return err
	}

	log.Printf("development root admin bootstrap ensured for user ID 1 (%s)", email)
	return nil
}
