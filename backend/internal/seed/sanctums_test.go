package seed

import (
	"errors"
	"testing"

	"sanctum/internal/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestSanctums_Idempotent(t *testing.T) {
	t.Parallel()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}

	err = db.AutoMigrate(&models.User{}, &models.Sanctum{}, &models.Conversation{})
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}

	err = Sanctums(db)
	if err != nil {
		t.Fatalf("first seed: %v", err)
	}
	err = Sanctums(db)
	if err != nil {
		t.Fatalf("second seed: %v", err)
	}

	var sanctumCount int64
	err = db.Model(&models.Sanctum{}).Count(&sanctumCount).Error
	if err != nil {
		t.Fatalf("count sanctums: %v", err)
	}
	if sanctumCount != int64(len(BuiltInSanctums)) {
		t.Fatalf("expected %d sanctums, got %d", len(BuiltInSanctums), sanctumCount)
	}

	var convCount int64
	err = db.Model(&models.Conversation{}).Where("sanctum_id IS NOT NULL").Count(&convCount).Error
	if err != nil {
		t.Fatalf("count conversations: %v", err)
	}
	if convCount != int64(len(BuiltInSanctums)) {
		t.Fatalf("expected %d sanctum chatrooms, got %d", len(BuiltInSanctums), convCount)
	}

	for _, item := range BuiltInSanctums {
		var s models.Sanctum
		err = db.Where("slug = ?", item.Slug).First(&s).Error
		if err != nil {
			t.Fatalf("missing sanctum %s: %v", item.Slug, err)
		}
		if s.Status != models.SanctumStatusActive {
			t.Fatalf("expected sanctum %s to be active, got %s", item.Slug, s.Status)
		}

		var linked models.Conversation
		err = db.Where("sanctum_id = ?", s.ID).First(&linked).Error
		if err != nil {
			t.Fatalf("missing linked conversation for %s: %v", item.Slug, err)
		}
	}

	rows, err := db.Raw(`
		SELECT sanctum_id
		FROM conversations
		WHERE sanctum_id IS NOT NULL
		GROUP BY sanctum_id
		HAVING COUNT(*) > 1
	`).Rows()
	if err != nil {
		t.Fatalf("duplicate sanctum_id check query failed: %v", err)
	}
	defer func() { _ = rows.Close() }()
	if rows.Next() {
		t.Fatal("found duplicate conversations for a sanctum")
	}
}

func TestSanctums_RemovesLegacyAtriumAndRenamesHerald(t *testing.T) {
	t.Parallel()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}

	err = db.AutoMigrate(&models.User{}, &models.Sanctum{}, &models.Conversation{})
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}

	legacyAtrium := models.Sanctum{
		Name:        "Atrium",
		Slug:        "atrium",
		Description: "legacy",
		Status:      models.SanctumStatusActive,
	}
	if err := db.Create(&legacyAtrium).Error; err != nil {
		t.Fatalf("create legacy atrium: %v", err)
	}
	legacyAtriumID := legacyAtrium.ID
	if err := db.Create(&models.Conversation{
		Name:      legacyAtrium.Name,
		IsGroup:   true,
		SanctumID: &legacyAtriumID,
	}).Error; err != nil {
		t.Fatalf("create legacy atrium conversation: %v", err)
	}

	legacyHerald := models.Sanctum{
		Name:        "Herald Announcements",
		Slug:        "herald",
		Description: "legacy",
		Status:      models.SanctumStatusActive,
	}
	if err := db.Create(&legacyHerald).Error; err != nil {
		t.Fatalf("create legacy herald: %v", err)
	}
	legacyHeraldID := legacyHerald.ID
	if err := db.Create(&models.Conversation{
		Name:      legacyHerald.Name,
		IsGroup:   true,
		SanctumID: &legacyHeraldID,
	}).Error; err != nil {
		t.Fatalf("create legacy herald conversation: %v", err)
	}

	if err := Sanctums(db); err != nil {
		t.Fatalf("seed sanctums: %v", err)
	}

	if err := db.Where("slug = ?", "atrium").First(&models.Sanctum{}).Error; !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("expected atrium sanctum to be removed, got err=%v", err)
	}

	var herald models.Sanctum
	if err := db.Where("slug = ?", "herald").First(&herald).Error; err != nil {
		t.Fatalf("expected herald sanctum to exist: %v", err)
	}
	if herald.Name != "Announcements" {
		t.Fatalf("expected herald name to be Announcements, got %q", herald.Name)
	}

	var heraldConv models.Conversation
	if err := db.Where("sanctum_id = ?", herald.ID).First(&heraldConv).Error; err != nil {
		t.Fatalf("expected herald conversation: %v", err)
	}
	if heraldConv.Name != "Announcements" {
		t.Fatalf("expected herald conversation name to be Announcements, got %q", heraldConv.Name)
	}
}
