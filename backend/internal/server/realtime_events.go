package server

import (
	"context"
	"encoding/json"
	"log"

	"sanctum/internal/models"
)

// Event type constants prevent typos in event names.
const (
	EventPostCreated            = "post_created"
	EventPostReactionUpdated    = "post_reaction_updated"
	EventCommentCreated         = "comment_created"
	EventCommentUpdated         = "comment_updated"
	EventCommentDeleted         = "comment_deleted"
	EventMessageReceived        = "message_received"
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
)

func (s *Server) publishAdminEvent(eventType string, payload map[string]interface{}) {
	// Find all admin IDs
	var adminIDs []uint
	if err := s.db.Model(&models.User{}).Where("is_admin = ?", true).Pluck("id", &adminIDs).Error; err != nil {
		log.Printf("failed to fetch admin IDs for %s event: %v", eventType, err)
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
		log.Printf("failed to marshal %s event: %v", eventType, err)
		return
	}
	message := string(eventJSON)
	if s.hub != nil {
		s.hub.Broadcast(userID, message)
	}
	if s.notifier != nil {
		if err := s.notifier.PublishUser(context.Background(), userID, message); err != nil {
			log.Printf("failed to publish %s event to user %d: %v", eventType, userID, err)
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
		log.Printf("failed to marshal %s event: %v", eventType, err)
		return
	}
	message := string(eventJSON)
	if s.hub != nil {
		s.hub.BroadcastAll(message)
	}
	if s.notifier != nil {
		if err := s.notifier.PublishBroadcast(context.Background(), message); err != nil {
			log.Printf("failed to publish %s broadcast event: %v", eventType, err)
		}
	}
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
