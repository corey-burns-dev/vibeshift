package db

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// NewDB creates a *sql.DB from a DATABASE_URL or from individual env vars.
// It pings the database with a short timeout to verify connectivity.
func NewDB() (*sql.DB, error) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		user := getenvDefault("POSTGRES_USER", "user")
		pass := os.Getenv("POSTGRES_PASSWORD")
		db := getenvDefault("POSTGRES_DB", "aichat")
		host := getenvDefault("POSTGRES_HOST", "localhost")
		port := getenvDefault("POSTGRES_PORT", "5432")
		if pass == "" {
			// If no password is provided, use a DSN without password (local dev)
			dsn = fmt.Sprintf("postgresql://%s@%s:%s/%s", user, host, port, db)
		} else {
			dsn = fmt.Sprintf("postgresql://%s:%s@%s:%s/%s", user, pass, host, port, db)
		}
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, err
	}

	return db, nil
}

func getenvDefault(k, d string) string {
	v := os.Getenv(k)
	if v == "" {
		return d
	}
	return v
}
