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
		Conname string `gorm:"column:conname"`
		Def     string `gorm:"column:def"`
	}
	db.Raw("SELECT conname, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid = 'sanctum_memberships'::regclass").Scan(&result)
	
	fmt.Println("Constraints on sanctum_memberships:")
	for _, r := range result {
		fmt.Printf(" - %s: %s\n", r.Conname, r.Def)
	}
}
