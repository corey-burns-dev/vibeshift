// Package server provides a compatibility wrapper around the internal server implementation.
package server

import (
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"

	"sanctum/internal/config"
	internalserver "sanctum/internal/server"
)

// Server is an alias for the internal server implementation.
type Server = internalserver.Server

// NewServer constructs a new Server using the internal constructor.
func NewServer(cfg *config.Config) (*Server, error) {
	return internalserver.NewServer(cfg)
}

// NewServerWithDeps constructs a Server with provided DB and Redis client.
func NewServerWithDeps(cfg *config.Config, db *gorm.DB, redisClient *redis.Client) (*Server, error) {
	return internalserver.NewServerWithDeps(cfg, db, redisClient)
}
