package database

import "sanctum/internal/models"

// PersistentModels returns the authoritative set of schema-managed GORM models.
func PersistentModels() []interface{} {
	return []interface{}{
		&models.User{},
		&models.Post{},
		&models.Comment{},
		&models.Like{},
		&models.Conversation{},
		&models.Message{},
		&models.ConversationParticipant{},
		&models.Friendship{},
		&models.GameRoom{},
		&models.GameMove{},
		&models.GameStats{},
		&models.Sanctum{},
		&models.SanctumRequest{},
		&models.SanctumMembership{},
	}
}
