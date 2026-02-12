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
		Def     string `gorm:"column:def"`
	}
	db.Raw("SELECT r.relname, c.conname, pg_get_constraintdef(c.oid) as def FROM pg_constraint c JOIN pg_class r ON c.conrelid = r.oid JOIN pg_namespace n ON n.oid = r.relnamespace WHERE n.nspname = 'public'").Scan(&result)
	
	fmt.Println("All constraints in database (public schema):")
	for _, r := range result {
		fmt.Printf(" - %s on %s: %s\n", r.Conname, r.Relname, r.Def)
	}
}
