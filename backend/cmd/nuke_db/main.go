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
	db.Exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
	db.Exec("GRANT ALL ON SCHEMA public TO public;")
	fmt.Println("Database nuked.")
}
