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

	var result []struct {
		Relname string `gorm:"column:relname"`
		Conname string `gorm:"column:conname"`
	}
	db.Raw("SELECT relname, conname FROM pg_constraint c JOIN pg_class r ON c.conrelid = r.oid WHERE conname = 'fk_sanctum_memberships_sanctum'").Scan(&result)
	
	fmt.Println("Tables with constraint fk_sanctum_memberships_sanctum:")
	for _, r := range result {
		fmt.Printf(" - %s\n", r.Relname)
	}
}
