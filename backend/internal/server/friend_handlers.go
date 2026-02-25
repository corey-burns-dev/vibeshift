// Package server contains HTTP and WebSocket handlers for the application's API endpoints.
package server

import (
	"errors"
	"time"

	"sanctum/internal/models"
	"sanctum/internal/service"

	"github.com/gofiber/fiber/v2"
)

// SendFriendRequest handles POST /api/friends/requests/:userId
func (s *Server) SendFriendRequest(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	targetUserID, err := s.parseID(c, "userId")
	if err != nil {
		return nil
	}

	friendship, err := s.friendSvc().SendFriendRequest(ctx, userID, targetUserID)
	if err != nil {
		status := mapServiceError(err)
		var appErr *models.AppError
		if errors.As(err, &appErr) {
			if appErr.Code == "VALIDATION_ERROR" {
				status = fiber.StatusConflict
				if appErr.Message == "Cannot send friend request to yourself" {
					status = fiber.StatusBadRequest
				}
			}
		}
		return models.RespondWithError(c, status, err)
	}

	// Notify both users so UI updates immediately.
	s.publishUserEvent(friendship.AddresseeID, EventFriendRequestReceived, map[string]interface{}{
		"request_id": friendship.ID,
		"from_user":  userSummary(friendship.Requester),
		"created_at": time.Now().UTC().Format(time.RFC3339Nano),
	})
	s.publishUserEvent(friendship.RequesterID, EventFriendRequestSent, map[string]interface{}{
		"request_id": friendship.ID,
		"to_user":    userSummary(friendship.Addressee),
		"created_at": time.Now().UTC().Format(time.RFC3339Nano),
	})

	return c.Status(fiber.StatusCreated).JSON(friendship)
}

// GetPendingRequests handles GET /api/friends/requests
func (s *Server) GetPendingRequests(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)

	requests, err := s.friendSvc().GetPendingRequests(ctx, userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(requests)
}

// GetSentRequests handles GET /api/friends/requests/sent
func (s *Server) GetSentRequests(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)

	requests, err := s.friendSvc().GetSentRequests(ctx, userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(requests)
}

// AcceptFriendRequest handles POST /api/friends/requests/:requestId/accept
func (s *Server) AcceptFriendRequest(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	requestID, err := s.parseID(c, "requestId")
	if err != nil {
		return nil
	}

	friendship, err := s.friendSvc().AcceptFriendRequest(ctx, userID, requestID)
	if err != nil {
		status := mapServiceError(err)
		var appErr *models.AppError
		if errors.As(err, &appErr) && appErr.Code == "VALIDATION_ERROR" {
			status = fiber.StatusConflict
		}
		return models.RespondWithError(c, status, err)
	}

	s.publishUserEvent(friendship.RequesterID, EventFriendRequestAccepted, map[string]interface{}{
		"request_id":  friendship.ID,
		"friend_user": userSummary(friendship.Addressee),
		"created_at":  time.Now().UTC().Format(time.RFC3339Nano),
	})
	s.publishUserEvent(friendship.AddresseeID, EventFriendAdded, map[string]interface{}{
		"request_id":  friendship.ID,
		"friend_user": userSummary(friendship.Requester),
		"created_at":  time.Now().UTC().Format(time.RFC3339Nano),
	})

	return c.JSON(friendship)
}

// RejectFriendRequest handles POST /api/friends/requests/:requestId/reject
func (s *Server) RejectFriendRequest(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	requestID, err := s.parseID(c, "requestId")
	if err != nil {
		return nil
	}

	friendship, err := s.friendSvc().RejectFriendRequest(ctx, userID, requestID)
	if err != nil {
		status := mapServiceError(err)
		var appErr *models.AppError
		if errors.As(err, &appErr) && appErr.Code == "VALIDATION_ERROR" {
			status = fiber.StatusConflict
		}
		return models.RespondWithError(c, status, err)
	}

	eventType := EventFriendRequestRejected
	if friendship.RequesterID == userID {
		eventType = EventFriendRequestCancelled
	}
	s.publishUserEvent(friendship.RequesterID, eventType, map[string]interface{}{
		"request_id":  friendship.ID,
		"by_user_id":  userID,
		"rejected_at": time.Now().UTC().Format(time.RFC3339Nano),
	})
	s.publishUserEvent(friendship.AddresseeID, eventType, map[string]interface{}{
		"request_id":  friendship.ID,
		"by_user_id":  userID,
		"rejected_at": time.Now().UTC().Format(time.RFC3339Nano),
	})

	return c.SendStatus(fiber.StatusNoContent)
}

// GetFriends handles GET /api/friends
func (s *Server) GetFriends(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)

	friends, err := s.friendSvc().GetFriends(ctx, userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(friends)
}

// GetFriendshipStatus handles GET /api/friends/status/:userId
func (s *Server) GetFriendshipStatus(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	targetUserID, err := s.parseID(c, "userId")
	if err != nil {
		return nil
	}

	status, requestID, friendship, err := s.friendSvc().GetFriendshipStatus(ctx, userID, targetUserID)
	if err != nil {
		return models.RespondWithError(c, mapServiceError(err), err)
	}

	return c.JSON(fiber.Map{
		"status":     status,
		"request_id": requestID,
		"friendship": friendship,
	})
}

// RemoveFriend handles DELETE /api/friends/:userId
func (s *Server) RemoveFriend(c *fiber.Ctx) error {
	ctx := c.UserContext()
	userID := c.Locals("userID").(uint)
	targetUserID, err := s.parseID(c, "userId")
	if err != nil {
		return nil
	}

	_, err = s.friendSvc().RemoveFriend(ctx, userID, targetUserID)
	if err != nil {
		return models.RespondWithError(c, mapServiceError(err), err)
	}

	s.publishUserEvent(userID, EventFriendRemoved, map[string]interface{}{
		"user_id":    targetUserID,
		"removed_at": time.Now().UTC().Format(time.RFC3339Nano),
	})
	s.publishUserEvent(targetUserID, EventFriendRemoved, map[string]interface{}{
		"user_id":    userID,
		"removed_at": time.Now().UTC().Format(time.RFC3339Nano),
	})

	return c.SendStatus(fiber.StatusNoContent)
}

func (s *Server) friendSvc() *service.FriendService {
	return service.NewFriendService(s.friendRepo, s.userRepo)
}
