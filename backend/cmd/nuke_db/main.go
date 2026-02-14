package main

import (
	"fmt"
	"log"
	"sanctum/internal/config"
	"sanctum/internal/database"
)

func main() {
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatal(err)
	}

	db, err := database.Connect(cfg)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("Nuking database...")
	if err := db.Exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;").Error; err != nil {
		log.Fatalf("failed to nuke schema: %v", err)
	}
	if err := db.Exec("GRANT ALL ON SCHEMA public TO public;").Error; err != nil {
		log.Fatalf("failed to grant schema permissions: %v", err)
	}
	fmt.Println("Database nuked.")
}
