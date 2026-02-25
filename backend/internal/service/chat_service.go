// Package service provides application business logic (chat, posts, users, etc.).
package service

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"sanctum/internal/cache"
	"sanctum/internal/models"
	"sanctum/internal/repository"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ChatService provides chat and conversation business logic.
type ChatService struct {
	chatRepo            repository.ChatRepository
	userRepo            repository.UserRepository
	db                  *gorm.DB
	isAdmin             func(ctx context.Context, userID uint) (bool, error)
	canModerateChatroom func(ctx context.Context, userID, roomID uint) (bool, error)
}

// CreateConversationInput is the input for creating a conversation.
type CreateConversationInput struct {
	UserID         uint
	Name           string
	IsGroup        bool
	ParticipantIDs []uint
}

// SendMessageInput is the input for sending a message.
type SendMessageInput struct {
	UserID         uint
	ConversationID uint
	Content        string
	MessageType    string
	Metadata       json.RawMessage
}

// NewChatService returns a new ChatService.
func NewChatService(
	chatRepo repository.ChatRepository,
	userRepo repository.UserRepository,
	db *gorm.DB,
	isAdmin func(ctx context.Context, userID uint) (bool, error),
	canModerateChatroom func(ctx context.Context, userID, roomID uint) (bool, error),
) *ChatService {
	return &ChatService{
		chatRepo:            chatRepo,
		userRepo:            userRepo,
		db:                  db,
		isAdmin:             isAdmin,
		canModerateChatroom: canModerateChatroom,
	}
}

// ChatroomWithJoined pairs a conversation with joined status.
type ChatroomWithJoined struct {
	Conversation *models.Conversation
	IsJoined     bool
}

// CreateConversation creates a new conversation (DM or group).
func (s *ChatService) CreateConversation(ctx context.Context, in CreateConversationInput) (*models.Conversation, error) {
	if in.IsGroup && in.Name == "" {
		return nil, models.NewValidationError("Group conversations require a name")
	}
	if len(in.ParticipantIDs) == 0 {
		return nil, models.NewValidationError("At least one participant is required")
	}

	if !in.IsGroup && len(in.ParticipantIDs) == 1 && in.ParticipantIDs[0] != in.UserID && s.db != nil {
		otherUserID := in.ParticipantIDs[0]
		blocked, err := s.usersBlocked(ctx, in.UserID, otherUserID)
		if err != nil {
			return nil, err
		}
		if blocked {
			return nil, models.NewForbiddenError("Cannot start a conversation with this user")
		}
		var existing models.Conversation
		findErr := s.db.WithContext(ctx).
			Model(&models.Conversation{}).
			Joins(
				"JOIN conversation_participants cp_self ON cp_self.conversation_id = conversations.id AND cp_self.user_id = ?",
				in.UserID,
			).
			Joins(
				"JOIN conversation_participants cp_other ON cp_other.conversation_id = conversations.id AND cp_other.user_id = ?",
				otherUserID,
			).
			Where("conversations.is_group = ?", false).
			Where(
				"NOT EXISTS (SELECT 1 FROM conversation_participants cp_extra WHERE cp_extra.conversation_id = conversations.id AND cp_extra.user_id NOT IN (?, ?))",
				in.UserID,
				otherUserID,
			).
			Order("conversations.updated_at DESC").
			First(&existing).Error
		switch {
		case findErr == nil:
			return s.chatRepo.GetConversation(ctx, existing.ID)
		case errors.Is(findErr, gorm.ErrRecordNotFound):
			// Create a new DM below.
		default:
			return nil, findErr
		}
	}

	conv := &models.Conversation{
		Name:      in.Name,
		IsGroup:   in.IsGroup,
		CreatedBy: in.UserID,
	}
	if err := s.chatRepo.CreateConversation(ctx, conv); err != nil {
		return nil, err
	}

	if err := s.chatRepo.AddParticipant(ctx, conv.ID, in.UserID); err != nil {
		return nil, err
	}

	for _, participantID := range in.ParticipantIDs {
		if participantID == in.UserID {
			continue
		}
		if err := s.chatRepo.AddParticipant(ctx, conv.ID, participantID); err != nil {
			return nil, err
		}
	}

	return s.chatRepo.GetConversation(ctx, conv.ID)
}

// GetConversations returns conversations for the user.
func (s *ChatService) GetConversations(ctx context.Context, userID uint) ([]*models.Conversation, error) {
	return s.chatRepo.GetUserConversations(ctx, userID)
}

// GetConversationForUser returns the conversation if the user is a participant.
func (s *ChatService) GetConversationForUser(ctx context.Context, convID, userID uint) (*models.Conversation, error) {
	conv, err := s.chatRepo.GetConversation(ctx, convID)
	if err != nil {
		return nil, err
	}
	if !isConversationParticipant(conv, userID) {
		return nil, models.NewUnauthorizedError("You are not a participant in this conversation")
	}
	return conv, nil
}

const maxMessageContentLen = 10000 // 10K characters

// SendMessage sends a message in a conversation.
func (s *ChatService) SendMessage(ctx context.Context, in SendMessageInput) (*models.Message, *models.Conversation, error) {
	if in.Content == "" {
		return nil, nil, models.NewValidationError("Message content is required")
	}
	if len(in.Content) > maxMessageContentLen {
		return nil, nil, models.NewValidationError("Message content too long (max 10000 characters)")
	}
	if in.MessageType == "" {
		in.MessageType = "text"
	}
	if in.Metadata == nil {
		in.Metadata = json.RawMessage("{}")
	}

	conv, err := s.chatRepo.GetConversation(ctx, in.ConversationID)
	if err != nil {
		return nil, nil, err
	}
	if !isConversationParticipant(conv, in.UserID) {
		return nil, nil, models.NewUnauthorizedError("You are not a participant in this conversation")
	}
	if !conv.IsGroup && len(conv.Participants) == 2 {
		for _, participant := range conv.Participants {
			if participant.ID == in.UserID {
				continue
			}
			blocked, berr := s.usersBlocked(ctx, in.UserID, participant.ID)
			if berr != nil {
				return nil, nil, berr
			}
			if blocked {
				return nil, nil, models.NewForbiddenError("Messaging is blocked between these users")
			}
		}
	}
	if conv.IsGroup {
		banned, berr := s.userBannedInRoom(ctx, conv.ID, in.UserID)
		if berr != nil {
			return nil, nil, berr
		}
		if banned {
			return nil, nil, models.NewForbiddenError("You are banned from this room")
		}
		muted, merr := s.userMutedInRoom(ctx, conv.ID, in.UserID)
		if merr != nil {
			return nil, nil, merr
		}
		if muted {
			return nil, nil, models.NewForbiddenError("You are muted in this room")
		}
	}

	message := &models.Message{
		ConversationID: in.ConversationID,
		SenderID:       in.UserID,
		Content:        in.Content,
		MessageType:    in.MessageType,
		Metadata:       in.Metadata,
	}
	if err := s.chatRepo.CreateMessage(ctx, message); err != nil {
		return nil, nil, err
	}

	if sender, err := s.userRepo.GetByID(ctx, in.UserID); err == nil {
		message.Sender = sender
	}

	return message, conv, nil
}

// GetMessagesForUser returns messages for a conversation (participant check applied).
func (s *ChatService) GetMessagesForUser(ctx context.Context, convID, userID uint, limit, offset int) ([]*models.Message, error) {
	conv, err := s.chatRepo.GetConversation(ctx, convID)
	if err != nil {
		return nil, err
	}
	if !isConversationParticipant(conv, userID) {
		return nil, models.NewUnauthorizedError("You are not a participant in this conversation")
	}
	messages, err := s.chatRepo.GetMessages(ctx, convID, limit, offset)
	if err != nil {
		return nil, err
	}
	blockedByUser, berr := s.blockedUserIDs(ctx, userID)
	if berr != nil {
		return nil, berr
	}
	if len(blockedByUser) == 0 {
		return messages, nil
	}
	filtered := make([]*models.Message, 0, len(messages))
	for _, message := range messages {
		if blockedByUser[message.SenderID] {
			continue
		}
		filtered = append(filtered, message)
	}
	return filtered, nil
}

// AddParticipant adds a participant to a group conversation.
func (s *ChatService) AddParticipant(ctx context.Context, convID, actorUserID, participantUserID uint) error {
	conv, err := s.chatRepo.GetConversation(ctx, convID)
	if err != nil {
		return err
	}
	if !isConversationParticipant(conv, actorUserID) {
		return models.NewUnauthorizedError("You are not a participant in this conversation")
	}
	if !conv.IsGroup {
		return models.NewValidationError("Cannot add participants to 1-on-1 conversations")
	}
	return s.chatRepo.AddParticipant(ctx, convID, participantUserID)
}

// LeaveConversation removes the user from the conversation.
func (s *ChatService) LeaveConversation(ctx context.Context, convID, userID uint) (*models.Conversation, error) {
	conv, err := s.chatRepo.GetConversation(ctx, convID)
	if err != nil {
		return nil, err
	}
	if !isConversationParticipant(conv, userID) {
		return nil, models.NewUnauthorizedError("You are not a participant in this conversation")
	}
	if err := s.chatRepo.RemoveParticipant(ctx, convID, userID); err != nil {
		return nil, err
	}
	return conv, nil
}

// GetAllChatrooms returns all group chatrooms with joined status for the user.
func (s *ChatService) GetAllChatrooms(ctx context.Context, userID uint) ([]ChatroomWithJoined, error) {
	var chatrooms []*models.Conversation
	key := cache.ChatroomsAllKeyWithVersion(ctx)

	err := cache.Aside(ctx, key, &chatrooms, cache.ListTTL, func() error {
		return s.db.WithContext(ctx).
			Where("is_group = ?", true).
			Preload("Participants").
			Preload("Messages", func(db *gorm.DB) *gorm.DB {
				return db.Order("created_at DESC").Limit(1)
			}).
			Preload("Messages.Sender").
			Order("name ASC").
			Find(&chatrooms).Error
	})
	if err != nil {
		return nil, err
	}

	result := make([]ChatroomWithJoined, 0, len(chatrooms))
	for _, room := range chatrooms {
		isJoined := false
		for _, p := range room.Participants {
			if p.ID == userID {
				isJoined = true
				break
			}
		}
		result = append(result, ChatroomWithJoined{
			Conversation: room,
			IsJoined:     isJoined,
		})
	}

	return result, nil
}

// GetJoinedChatrooms returns group chatrooms the user has joined.
func (s *ChatService) GetJoinedChatrooms(ctx context.Context, userID uint) ([]*models.Conversation, error) {
	var chatrooms []*models.Conversation
	err := s.db.WithContext(ctx).
		Joins("JOIN conversation_participants cp ON cp.conversation_id = conversations.id").
		Where("conversations.is_group = ? AND cp.user_id = ?", true, userID).
		Preload("Participants").
		Preload("Messages", func(db *gorm.DB) *gorm.DB {
			return db.Order("created_at DESC").Limit(1)
		}).
		Preload("Messages.Sender").
		Order("conversations.name ASC").
		Find(&chatrooms).Error
	if err != nil {
		return nil, err
	}
	return chatrooms, nil
}

// JoinChatroom adds the user to a group chatroom.
func (s *ChatService) JoinChatroom(ctx context.Context, roomID, userID uint) (*models.Conversation, error) {
	var conv models.Conversation
	if err := s.db.WithContext(ctx).First(&conv, roomID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, models.NewNotFoundError("Chatroom", roomID)
		}
		return nil, err
	}
	if !conv.IsGroup {
		return nil, models.NewValidationError("Cannot join a 1-on-1 conversation")
	}
	banned, err := s.userBannedInRoom(ctx, roomID, userID)
	if err != nil {
		return nil, err
	}
	if banned {
		return nil, models.NewForbiddenError("You are banned from this room")
	}

	err = s.db.WithContext(ctx).Clauses(clause.OnConflict{DoNothing: true}).Create(&models.ConversationParticipant{
		ConversationID: roomID,
		UserID:         userID,
	}).Error
	if err != nil {
		return nil, err
	}

	cache.InvalidateRoom(ctx, roomID)

	return &conv, nil
}

// RemoveParticipant removes a participant from a group chatroom (moderator or self).
func (s *ChatService) RemoveParticipant(ctx context.Context, roomID, actorUserID, participantUserID uint) (string, error) {
	var conv models.Conversation
	if err := s.db.WithContext(ctx).First(&conv, roomID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", models.NewNotFoundError("Chatroom", roomID)
		}
		return "", err
	}

	authorized := false
	if s.canModerateChatroom != nil {
		var err error
		authorized, err = s.canModerateChatroom(ctx, actorUserID, roomID)
		if err != nil {
			return "", err
		}
	} else {
		admin := false
		if s.isAdmin != nil {
			var err error
			admin, err = s.isAdmin(ctx, actorUserID)
			if err != nil {
				return "", err
			}
		}
		authorized = admin || conv.CreatedBy == actorUserID
	}

	if !authorized {
		return "", models.NewUnauthorizedError("You do not have permission to moderate this chatroom")
	}

	if err := s.db.WithContext(ctx).
		Where("conversation_id = ? AND user_id = ?", roomID, participantUserID).
		Delete(&models.ConversationParticipant{}).Error; err != nil {
		return "", err
	}

	username := ""
	if user, err := s.userRepo.GetByID(ctx, actorUserID); err == nil && user != nil {
		username = user.Username
	}

	return username, nil
}

func (s *ChatService) userBannedInRoom(ctx context.Context, roomID, userID uint) (bool, error) {
	if s.db == nil {
		return false, nil
	}
	var count int64
	err := s.db.WithContext(ctx).
		Model(&models.ChatroomBan{}).
		Where("conversation_id = ? AND user_id = ?", roomID, userID).
		Count(&count).Error
	if err != nil {
		if models.IsSchemaMissingError(err) {
			return false, nil
		}
		return false, err
	}
	return count > 0, nil
}

func isConversationParticipant(conv *models.Conversation, userID uint) bool {
	for _, participant := range conv.Participants {
		if participant.ID == userID {
			return true
		}
	}
	return false
}

func (s *ChatService) usersBlocked(ctx context.Context, userID, otherUserID uint) (bool, error) {
	if s.db == nil {
		return false, nil
	}
	var count int64
	if err := s.db.WithContext(ctx).
		Model(&models.UserBlock{}).
		Where(
			"(blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)",
			userID, otherUserID, otherUserID, userID,
		).
		Count(&count).Error; err != nil {
		if models.IsSchemaMissingError(err) {
			return false, nil
		}
		return false, err
	}
	return count > 0, nil
}

func (s *ChatService) userMutedInRoom(ctx context.Context, roomID, userID uint) (bool, error) {
	if s.db == nil {
		return false, nil
	}
	var mute models.ChatroomMute
	err := s.db.WithContext(ctx).
		Where("conversation_id = ? AND user_id = ?", roomID, userID).
		First(&mute).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		if models.IsSchemaMissingError(err) {
			return false, nil
		}
		return false, err
	}
	if mute.MutedUntil == nil {
		return true, nil
	}
	return mute.MutedUntil.After(time.Now().UTC()), nil
}

func (s *ChatService) blockedUserIDs(ctx context.Context, userID uint) (map[uint]bool, error) {
	if s.db == nil {
		return map[uint]bool{}, nil
	}
	var blocked []uint
	if err := s.db.WithContext(ctx).
		Model(&models.UserBlock{}).
		Where("blocker_id = ?", userID).
		Pluck("blocked_id", &blocked).Error; err != nil {
		if models.IsSchemaMissingError(err) {
			return map[uint]bool{}, nil
		}
		return nil, err
	}
	result := make(map[uint]bool, len(blocked))
	for _, id := range blocked {
		result[id] = true
	}
	return result, nil
}
