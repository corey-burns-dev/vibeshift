// Package main provides admin management utilities for Sanctum.
package main

import (
	"errors"
	"fmt"
	"log"
	"os"

	"sanctum/internal/config"
	"sanctum/internal/database"
	"sanctum/internal/models"

	"gorm.io/gorm"
)

// AdminSetup provides a utility to promote a user to admin or create admin accounts
func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage:")
		fmt.Println("  go run ./cmd/admin/main.go promote <user_id>     - Promote user to admin")
		fmt.Println("  go run ./cmd/admin/main.go demote <user_id>       - Demote user from admin")
		fmt.Println("  go run ./cmd/admin/main.go list-admins            - List all admins")
		os.Exit(1)
	}

	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	db, err := database.Connect(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	command := os.Args[1]

	switch command {
	case "promote":
		if len(os.Args) < 3 {
			fmt.Println("Usage: go run ./cmd/admin/main.go promote <user_id>")
			os.Exit(1)
		}
		promoteToAdmin(db, os.Args[2])

	case "demote":
		if len(os.Args) < 3 {
			fmt.Println("Usage: go run ./cmd/admin/main.go demote <user_id>")
			os.Exit(1)
		}
		demoteFromAdmin(db, os.Args[2])

	case "list-admins":
		listAdmins(db)

	default:
		fmt.Printf("Unknown command: %s\n", command)
		os.Exit(1)
	}
}

func promoteToAdmin(db *gorm.DB, userID string) {
	var user models.User
	if err := db.First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			fmt.Printf("User with ID %s not found\n", userID)
		} else {
			log.Fatalf("Database error: %v", err)
		}
		os.Exit(1)
	}

	if user.IsAdmin {
		fmt.Printf("User %s (ID: %d) is already an admin\n", user.Username, user.ID)
		return
	}

	user.IsAdmin = true
	if err := db.Save(&user).Error; err != nil {
		log.Fatalf("Failed to promote user: %v", err)
	}

	fmt.Printf("✅ Successfully promoted %s (ID: %d) to admin\n", user.Username, user.ID)
}

func demoteFromAdmin(db *gorm.DB, userID string) {
	var user models.User
	if err := db.First(&user, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			fmt.Printf("User with ID %s not found\n", userID)
		} else {
			log.Fatalf("Database error: %v", err)
		}
		os.Exit(1)
	}

	if !user.IsAdmin {
		fmt.Printf("User %s (ID: %d) is not an admin\n", user.Username, user.ID)
		return
	}

	user.IsAdmin = false
	if err := db.Save(&user).Error; err != nil {
		log.Fatalf("Failed to demote user: %v", err)
	}

	fmt.Printf("✅ Successfully demoted %s (ID: %d) from admin\n", user.Username, user.ID)
}

func listAdmins(db *gorm.DB) {
	var admins []models.User
	if err := db.Where("is_admin = ?", true).Find(&admins).Error; err != nil {
		log.Fatalf("Failed to fetch admins: %v", err)
	}

	if len(admins) == 0 {
		fmt.Println("No admins found in the system")
		return
	}

	fmt.Println("\n📋 Current Admins:")
	fmt.Println("─────────────────────────────────────")
	for _, admin := range admins {
		fmt.Printf("ID: %d | Username: %s | Email: %s\n", admin.ID, admin.Username, admin.Email)
	}
	fmt.Println("─────────────────────────────────────")
}
