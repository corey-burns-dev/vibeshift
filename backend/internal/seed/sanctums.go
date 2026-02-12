package seed

import (
	"errors"
	"fmt"

	"sanctum/internal/models"

	"gorm.io/gorm"
)

// BuiltInSanctum is a permanent system sanctum.
type BuiltInSanctum struct {
	Name        string
	Slug        string
	Description string
}

// BuiltInSanctums defines the permanent system sanctums.
var BuiltInSanctums = []BuiltInSanctum{
	{Name: "Atrium", Slug: "atrium", Description: "General community discussions."},
	{Name: "General", Slug: "general", Description: "Core discussion for Sanctum."},
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
	return db.Transaction(func(tx *gorm.DB) error {
		for _, item := range BuiltInSanctums {
			var sanctum models.Sanctum

			// Try to find existing sanctum first
			err := tx.Where("slug = ?", item.Slug).First(&sanctum).Error
			if err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					// Create new
					sanctum = models.Sanctum{
						Name:        item.Name,
						Slug:        item.Slug,
						Description: item.Description,
						Status:      models.SanctumStatusActive,
					}
					if err := tx.Create(&sanctum).Error; err != nil {
						return fmt.Errorf("failed to create sanctum %s: %w", item.Slug, err)
					}
				} else {
					return err
				}
			} else {
				// Update existing
				sanctum.Name = item.Name
				sanctum.Description = item.Description
				sanctum.Status = models.SanctumStatusActive
				if err := tx.Save(&sanctum).Error; err != nil {
					return fmt.Errorf("failed to update sanctum %s: %w", item.Slug, err)
				}
			}

			// Check for existing conversation
			var existing models.Conversation
			queryErr := tx.Where("sanctum_id = ?", sanctum.ID).First(&existing).Error

			if queryErr == nil {
				// Update existing conversation name if needed
				if existing.Name != sanctum.Name {
					if err := tx.Model(&existing).Update("name", sanctum.Name).Error; err != nil {
						return err
					}
				}
				continue
			}

			if !errors.Is(queryErr, gorm.ErrRecordNotFound) {
				return queryErr
			}

			// Create new conversation
			sid := sanctum.ID
			conv := models.Conversation{
				Name:      sanctum.Name,
				IsGroup:   true,
				CreatedBy: 0,
				SanctumID: &sid,
			}
			if err := tx.Create(&conv).Error; err != nil {
				return fmt.Errorf("failed to create conversation for sanctum %s (ID: %d): %w", item.Slug, sid, err)
			}
		}
		return nil
	})
}

