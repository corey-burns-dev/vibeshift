package database

import "sanctum/internal/models"

// PersistentModels returns the authoritative set of schema-managed GORM models.
func PersistentModels() []interface{} {
	return []interface{}{
		&models.User{},
		&models.Post{},
		&models.Poll{},
		&models.PollOption{},
		&models.PollVote{},
		&models.Image{},
		&models.ImageVariant{},
		&models.Comment{},
		&models.Like{},
		&models.Conversation{},
		&models.ChatroomModerator{},
		&models.ChatroomBan{},
		&models.Message{},
		&models.MessageReaction{},
		&models.MessageMention{},
		&models.ConversationParticipant{},
		&models.UserBlock{},
		&models.ModerationReport{},
		&models.ChatroomMute{},
		&models.WelcomeBotEvent{},
		&models.Friendship{},
		&models.GameRoom{},
		&models.GameMove{},
		&models.GameStats{},
		&models.Sanctum{},
		&models.SanctumRequest{},
		&models.SanctumMembership{},
	}
}
