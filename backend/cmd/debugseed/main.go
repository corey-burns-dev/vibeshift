// Package main provides a CLI to run database seed for development/debugging.
package main

import (
	"log"

	"sanctum/internal/config"
	"sanctum/internal/database"
	"sanctum/internal/seed"
)

func main() {
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	db, err := database.Connect(cfg)
	if err != nil {
		log.Fatalf("connect db: %v", err)
	}

	log.Println("Connected to DB, running seed.Sanctums()")
	if err := seed.Sanctums(db); err != nil {
		log.Fatalf("seed.Sanctums failed: %v", err)
	}
	log.Println("seed.Sanctums completed")
}
