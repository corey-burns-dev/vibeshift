package seed

import (
	"testing"

	"sanctum/internal/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestSeedSocialMesh_SeedsSanctumMemberships(t *testing.T) {
	t.Parallel()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}

	if migrateErr := db.AutoMigrate(
		&models.User{},
		&models.Sanctum{},
		&models.Conversation{},
		&models.SanctumMembership{},
		&models.Friendship{},
	); migrateErr != nil {
		t.Fatalf("migrate: %v", migrateErr)
	}

	if seedErr := Sanctums(db); seedErr != nil {
		t.Fatalf("seed sanctums: %v", seedErr)
	}

	seeder := NewSeeder(db, Options{SkipBcrypt: true})
	users, err := seeder.SeedSocialMesh(6)
	if err != nil {
		t.Fatalf("seed social mesh: %v", err)
	}
	if len(users) == 0 {
		t.Fatal("expected seeded users")
	}

	var activeSanctumCount int64
	if err := db.Model(&models.Sanctum{}).
		Where("status = ?", models.SanctumStatusActive).
		Count(&activeSanctumCount).Error; err != nil {
		t.Fatalf("count sanctums: %v", err)
	}

	var membershipCount int64
	if err := db.Model(&models.SanctumMembership{}).Count(&membershipCount).Error; err != nil {
		t.Fatalf("count memberships: %v", err)
	}

	expected := int64(len(users)) * activeSanctumCount
	if membershipCount != expected {
		t.Fatalf("expected %d memberships, got %d", expected, membershipCount)
	}
}
