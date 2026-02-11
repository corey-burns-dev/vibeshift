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
	{Name: "The Atrium", Slug: "atrium", Description: "Core discussion for Sanctum."},
	{Name: "The Herald", Slug: "herald", Description: "Announcements and platform updates."},
	{Name: "Sanctum Support", Slug: "support", Description: "Help and troubleshooting."},
	{Name: "The Silver Screen", Slug: "movies", Description: "Film discussion and recommendations."},
	{Name: "The Small Screen", Slug: "television", Description: "TV shows and series conversation."},
	{Name: "The Archive", Slug: "books", Description: "Books, writing, and reading lists."},
	{Name: "The Sound Chamber", Slug: "music", Description: "Music discovery and discussion."},
	{Name: "The Anime Hall", Slug: "anime", Description: "Anime and manga talk."},
	{Name: "The Game Room", Slug: "gaming", Description: "Gaming across all platforms."},
	{Name: "The Rig", Slug: "pcgaming", Description: "PC gaming hardware and titles."},
	{Name: "The Forge", Slug: "development", Description: "Software development discussions."},
	{Name: "The Machine Room", Slug: "hardware", Description: "Hardware builds and tuning."},
	{Name: "The Terminal", Slug: "linux", Description: "Linux distros, tooling, and workflows."},
	{Name: "The Oracle", Slug: "ai", Description: "AI trends, tools, and research."},
	{Name: "The Training Grounds", Slug: "fitness", Description: "Fitness and training programs."},
	{Name: "The Hearth", Slug: "food", Description: "Food, cooking, and nutrition."},
}

// Sanctums seeds permanent built-in sanctums and their default chat rooms.
func Sanctums(db *gorm.DB) error {
	for _, item := range BuiltInSanctums {
		err := db.Transaction(func(tx *gorm.DB) error {
			sanctum := models.Sanctum{
				Name:        item.Name,
				Slug:        item.Slug,
				Description: item.Description,
				Status:      models.SanctumStatusActive,
			}

			if err := tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "slug"}},
				DoUpdates: clause.AssignmentColumns([]string{"name", "description", "status", "updated_at"}),
			}).Create(&sanctum).Error; err != nil {
				return err
			}

			if sanctum.ID == 0 {
				if err := tx.Where("slug = ?", item.Slug).First(&sanctum).Error; err != nil {
					return err
				}
			}

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
			case queryErr != nil && !errors.Is(queryErr, gorm.ErrRecordNotFound):
				return queryErr
			}

			conv := models.Conversation{
				Name:      sanctum.Name,
				IsGroup:   true,
				CreatedBy: 0,
				SanctumID: &sanctum.ID,
			}
			if err := tx.Create(&conv).Error; err != nil {
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
