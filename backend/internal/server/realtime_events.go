package server

import (
	"context"
	"encoding/json"
	"log/slog"

	"sanctum/internal/models"
	"sanctum/internal/observability"
)

// Event type constants prevent typos in event names.
const (
	EventPostCreated            = "post_created"
	EventPostReactionUpdated    = "post_reaction_updated"
	EventCommentCreated         = "comment_created"
	EventCommentUpdated         = "comment_updated"
	EventCommentDeleted         = "comment_deleted"
	EventMessageReceived        = "message_received"
	EventChatMention            = "chat_mention"
	EventFriendRequestReceived  = "friend_request_received"
	EventFriendRequestSent      = "friend_request_sent"
	EventFriendRequestAccepted  = "friend_request_accepted"
	EventFriendAdded            = "friend_added"
	EventFriendRequestRejected  = "friend_request_rejected"
	EventFriendRequestCancelled = "friend_request_cancelled"
	EventFriendRemoved          = "friend_removed"
	EventFriendPresenceChanged  = "friend_presence_changed"
	EventSanctumRequestCreated  = "sanctum_request_created"
	EventSanctumRequestReviewed = "sanctum_request_reviewed"
	EventGameRoomUpdated        = "game_room_updated"
)

func (s *Server) publishAdminEvent(eventType string, payload map[string]interface{}) {
	// Find all admin IDs
	var adminIDs []uint
	if err := s.db.Model(&models.User{}).Where("is_admin = ?", true).Pluck("id", &adminIDs).Error; err != nil {
		observability.GlobalLogger.ErrorContext(context.Background(), "failed to fetch admin IDs",
			slog.String("event_type", eventType),
			slog.String("error", err.Error()),
		)
		return
	}

	for _, adminID := range adminIDs {
		s.publishUserEvent(adminID, eventType, payload)
	}
}

func (s *Server) publishUserEvent(userID uint, eventType string, payload map[string]interface{}) {
	event := map[string]interface{}{
		"type":    eventType,
		"payload": payload,
	}
	eventJSON, err := json.Marshal(event)
	if err != nil {
		observability.GlobalLogger.ErrorContext(context.Background(), "failed to marshal user event",
			slog.String("event_type", eventType),
			slog.String("error", err.Error()),
		)
		return
	}
	message := string(eventJSON)
	if s.hub != nil {
		s.hub.Broadcast(userID, message)
	}
	if s.notifier != nil {
		if err := s.notifier.PublishUser(context.Background(), userID, message); err != nil {
			observability.GlobalLogger.ErrorContext(context.Background(), "failed to publish user event",
				slog.String("event_type", eventType),
				slog.Uint64("user_id", uint64(userID)),
				slog.String("error", err.Error()),
			)
		}
	}
}

func (s *Server) publishBroadcastEvent(eventType string, payload map[string]interface{}) {
	event := map[string]interface{}{
		"type":    eventType,
		"payload": payload,
	}
	eventJSON, err := json.Marshal(event)
	if err != nil {
		observability.GlobalLogger.ErrorContext(context.Background(), "failed to marshal broadcast event",
			slog.String("event_type", eventType),
			slog.String("error", err.Error()),
		)
		return
	}
	message := string(eventJSON)
	if s.hub != nil {
		s.hub.BroadcastAll(message)
	}
	if s.notifier != nil {
		if err := s.notifier.PublishBroadcast(context.Background(), message); err != nil {
			observability.GlobalLogger.ErrorContext(context.Background(), "failed to publish broadcast event",
				slog.String("event_type", eventType),
				slog.String("error", err.Error()),
			)
		}
	}
}

func gameRoomRealtimePayload(room *models.GameRoom) map[string]interface{} {
	return map[string]interface{}{
		"room_id":      room.ID,
		"type":         room.Type,
		"status":       room.Status,
		"next_turn_id": room.NextTurnID,
		"winner_id":    room.WinnerID,
		"is_draw":      room.IsDraw,
		"updated_at":   room.UpdatedAt,
	}
}

func (s *Server) publishGameRoomUpdatedToParticipants(room *models.GameRoom, extraParticipantIDs ...uint) {
	if room == nil {
		return
	}

	participantIDs := map[uint]struct{}{}
	if room.CreatorID != nil {
		participantIDs[*room.CreatorID] = struct{}{}
	}
	if room.OpponentID != nil {
		participantIDs[*room.OpponentID] = struct{}{}
	}
	for _, participantID := range extraParticipantIDs {
		if participantID == 0 {
			continue
		}
		participantIDs[participantID] = struct{}{}
	}

	if len(participantIDs) == 0 {
		return
	}

	payload := gameRoomRealtimePayload(room)
	for participantID := range participantIDs {
		s.publishUserEvent(participantID, EventGameRoomUpdated, payload)
	}
}

func (s *Server) publishGameRoomUpdated(room *models.GameRoom) {
	s.publishGameRoomUpdatedToParticipants(room)
}

func userSummary(user models.User) map[string]interface{} {
	return map[string]interface{}{
		"id":       user.ID,
		"username": user.Username,
		"avatar":   user.Avatar,
	}
}

func userSummaryPtr(user *models.User) map[string]interface{} {
	if user == nil {
		return nil
	}
	return userSummary(*user)
}
