package server

import (
	"context"
	"errors"
	"fmt"

	"sanctum/internal/models"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	welcomeBotUsername = "welcomebot"
	welcomeBotEmail    = "welcomebot@sanctum.local"
)

func (s *Server) maybeSendWelcomeSignupDM(ctx context.Context, userID uint) {
	if s.db == nil {
		return
	}

	bot, err := s.ensureWelcomeBotUser(ctx)
	if err != nil || bot == nil {
		return
	}

	event := models.WelcomeBotEvent{UserID: userID, EventType: models.WelcomeEventSignupDM}
	res := s.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&event)
	if res.Error != nil || res.RowsAffected == 0 {
		return
	}

	conversationID, err := s.ensureDirectConversation(ctx, bot.ID, userID)
	if err != nil {
		return
	}

	_ = s.db.WithContext(ctx).Create(&models.Message{
		ConversationID: conversationID,
		SenderID:       bot.ID,
		Content:        "Welcome to Sanctum. Use @mentions, reactions, and reports to keep conversations healthy.",
		MessageType:    "text",
	}).Error
}

func (s *Server) maybeSendWelcomeRoomJoinMessage(ctx context.Context, userID, conversationID uint) {
	if s.db == nil {
		return
	}

	bot, err := s.ensureWelcomeBotUser(ctx)
	if err != nil || bot == nil {
		return
	}

	event := models.WelcomeBotEvent{
		UserID:         userID,
		ConversationID: &conversationID,
		EventType:      models.WelcomeEventRoomJoin,
	}
	res := s.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&event)
	if res.Error != nil || res.RowsAffected == 0 {
		return
	}

	_ = s.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&models.ConversationParticipant{
		ConversationID: conversationID,
		UserID:         bot.ID,
	}).Error

	_ = s.db.WithContext(ctx).Create(&models.Message{
		ConversationID: conversationID,
		SenderID:       bot.ID,
		Content:        fmt.Sprintf("Welcome, user #%d. Keep it respectful and use reports for safety issues.", userID),
		MessageType:    "text",
	}).Error
}

func (s *Server) ensureWelcomeBotUser(ctx context.Context) (*models.User, error) {
	var user models.User
	err := s.db.WithContext(ctx).Where("username = ?", welcomeBotUsername).First(&user).Error
	if err == nil {
		return &user, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	hash, herr := bcrypt.GenerateFromPassword([]byte("welcome-bot-internal"), bcrypt.DefaultCost)
	if herr != nil {
		return nil, herr
	}

	created := models.User{
		Username: welcomeBotUsername,
		Email:    welcomeBotEmail,
		Password: string(hash),
		Bio:      "System assistant",
	}
	if cerr := s.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&created).Error; cerr != nil {
		return nil, cerr
	}
	if created.ID != 0 {
		return &created, nil
	}

	if rerr := s.db.WithContext(ctx).Where("username = ?", welcomeBotUsername).First(&user).Error; rerr != nil {
		return nil, rerr
	}
	return &user, nil
}

func (s *Server) ensureDirectConversation(ctx context.Context, userID, otherUserID uint) (uint, error) {
	var existing models.Conversation
	findErr := s.db.WithContext(ctx).
		Model(&models.Conversation{}).
		Joins(
			"JOIN conversation_participants cp_self ON cp_self.conversation_id = conversations.id AND cp_self.user_id = ?",
			userID,
		).
		Joins(
			"JOIN conversation_participants cp_other ON cp_other.conversation_id = conversations.id AND cp_other.user_id = ?",
			otherUserID,
		).
		Where("conversations.is_group = ?", false).
		Where(
			"NOT EXISTS (SELECT 1 FROM conversation_participants cp_extra WHERE cp_extra.conversation_id = conversations.id AND cp_extra.user_id NOT IN (?, ?))",
			userID,
			otherUserID,
		).
		Order("conversations.updated_at DESC").
		First(&existing).Error
	if findErr == nil {
		return existing.ID, nil
	}
	if !errors.Is(findErr, gorm.ErrRecordNotFound) {
		return 0, findErr
	}

	conv := models.Conversation{IsGroup: false, CreatedBy: userID, Name: ""}
	if err := s.db.WithContext(ctx).Create(&conv).Error; err != nil {
		return 0, err
	}
	participants := []models.ConversationParticipant{
		{ConversationID: conv.ID, UserID: userID},
		{ConversationID: conv.ID, UserID: otherUserID},
	}
	for _, participant := range participants {
		if err := s.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&participant).Error; err != nil {
			return 0, err
		}
	}

	return conv.ID, nil
}
