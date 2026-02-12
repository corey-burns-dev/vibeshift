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

	var def string
	db.Raw("SELECT pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conname = 'fk_sanctum_memberships_sanctum'").Scan(&def)
	fmt.Printf("Constraint fk_sanctum_memberships_sanctum definition: %s\n", def)
}
