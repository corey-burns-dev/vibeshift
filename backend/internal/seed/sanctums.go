package seed

import (
	"errors"
	"fmt"

	"sanctum/internal/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// BuiltInSanctum is a permanent system sanctum.
type BuiltInSanctum struct {
	Name        string
	Slug        string
	Description string
}

// BuiltInSanctums defines the permanent system sanctums.
var BuiltInSanctums = []BuiltInSanctum{
	{Name: "General", Slug: "atrium", Description: "Core discussion for Sanctum."},
	{Name: "Herald Announcements", Slug: "herald", Description: "Announcements and platform updates."},
	{Name: "Support", Slug: "support", Description: "Help and troubleshooting."},
	{Name: "Movies", Slug: "movies", Description: "Film discussion and recommendations."},
	{Name: "Television", Slug: "television", Description: "TV shows and series conversation."},
	{Name: "Books", Slug: "books", Description: "Books, writing, and reading lists."},
	{Name: "Music", Slug: "music", Description: "Music discovery and discussion."},
	{Name: "Anime", Slug: "anime", Description: "Anime and manga talk."},
	{Name: "Gaming", Slug: "gaming", Description: "Gaming across all platforms."},
	{Name: "Pcgaming", Slug: "pcgaming", Description: "PC gaming hardware and titles."},
	{Name: "Development", Slug: "development", Description: "Software development discussions."},
	{Name: "Hardware", Slug: "hardware", Description: "Hardware builds and tuning."},
	{Name: "Linux", Slug: "linux", Description: "Linux distros, tooling, and workflows."},
	{Name: "Ai", Slug: "ai", Description: "AI trends, tools, and research."},
	{Name: "Fitness", Slug: "fitness", Description: "Fitness and training programs."},
	{Name: "Food", Slug: "food", Description: "Food, cooking, and nutrition."},
}

// Sanctums seeds permanent built-in sanctums and their default chat rooms.
func Sanctums(db *gorm.DB) error {
	for _, item := range BuiltInSanctums {
		// Upsert the sanctum first (committed/persisted outside the conversation transaction)
		sanctum := models.Sanctum{
			Name:        item.Name,
			Slug:        item.Slug,
			Description: item.Description,
			Status:      models.SanctumStatusActive,
		}

		if err := db.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "slug"}},
			DoUpdates: clause.AssignmentColumns([]string{"name", "description", "status", "updated_at"}),
		}).Create(&sanctum).Error; err != nil {
			return fmt.Errorf("seed built-in sanctum %s: %w", item.Slug, err)
		}

		// Reload to get the persisted ID
		if err := db.Where("slug = ?", item.Slug).First(&sanctum).Error; err != nil {
			return fmt.Errorf("seed built-in sanctum %s: %w", item.Slug, err)
		}

		// Create or update the conversation in its own transaction so the FK references a committed sanctum
		err := db.Transaction(func(tx *gorm.DB) error {
			var existing models.Conversation
			queryErr := tx.Where("sanctum_id = ?", sanctum.ID).First(&existing).Error
			switch {
			case queryErr == nil:
				if existing.Name != sanctum.Name {
					updateErr := tx.Model(&models.Conversation{}).Where("id = ?", existing.ID).Update("name", sanctum.Name).Error
					if updateErr != nil {
						return updateErr
					}
				}
				return nil
			case !errors.Is(queryErr, gorm.ErrRecordNotFound):
				return queryErr
			}

			// Create conversation without sanctum_id first to avoid FK timing issues,
			// then set sanctum_id in a separate update.
			conv := models.Conversation{
				Name:      sanctum.Name,
				IsGroup:   true,
				CreatedBy: 0,
				SanctumID: nil,
			}
			if err := tx.Create(&conv).Error; err != nil {
				return err
			}
			if err := tx.Model(&conv).Where("id = ?", conv.ID).Update("sanctum_id", sanctum.ID).Error; err != nil {
				return err
			}
			return nil
		})
		if err != nil {
			return fmt.Errorf("seed built-in sanctum %s: %w", item.Slug, err)
		}
	}

	return nil
}
