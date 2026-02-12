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

	var columns []struct {
		ColumnName string `gorm:"column:column_name"`
		DataType   string `gorm:"column:data_type"`
	}
	db.Raw("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'conversations'").Scan(&columns)
	fmt.Println("Columns in conversations:")
	for _, c := range columns {
		fmt.Printf(" - %s: %s\n", c.ColumnName, c.DataType)
	}

	var constraints []struct {
		ConstraintName string `gorm:"column:constraint_name"`
		ConstraintType string `gorm:"column:constraint_type"`
	}
	db.Raw("SELECT constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_name = 'conversations'").Scan(&constraints)
	fmt.Println("Constraints in conversations:")
	for _, c := range constraints {
		fmt.Printf(" - %s: %s\n", c.ConstraintName, c.ConstraintType)
	}

	db.Raw("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'sanctums'").Scan(&columns)
	fmt.Println("Columns in sanctums:")
	for _, c := range columns {
		fmt.Printf(" - %s: %s\n", c.ColumnName, c.DataType)
	}

	db.Raw("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'sanctum_memberships'").Scan(&columns)
	fmt.Println("Columns in sanctum_memberships:")
	for _, c := range columns {
		fmt.Printf(" - %s: %s\n", c.ColumnName, c.DataType)
	}

	var count int64
	db.Raw("SELECT count(*) FROM sanctums").Scan(&count)
	fmt.Printf("Rows in sanctums: %d\n", count)

	var tables []string
	db.Raw("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'").Scan(&tables)
	fmt.Println("Tables in public schema:")
	for _, t := range tables {
		fmt.Printf(" - %s\n", t)
	}
}
