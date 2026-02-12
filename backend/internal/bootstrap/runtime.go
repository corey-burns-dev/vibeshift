package bootstrap

import (
	"fmt"

	"sanctum/internal/cache"
	"sanctum/internal/config"
	"sanctum/internal/database"
	"sanctum/internal/seed"

	"github.com/redis/go-redis/v9"
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

	if opts.SeedBuiltIns {
		if err := seed.Sanctums(db); err != nil {
			return nil, nil, fmt.Errorf("failed to seed built-in sanctums: %w", err)
		}
	}

	return db, r, nil
}
