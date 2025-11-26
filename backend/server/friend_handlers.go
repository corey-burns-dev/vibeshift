package server

import (
	"vibeshift/models"

	"github.com/gofiber/fiber/v2"
)

// SendFriendRequest handles POST /api/friends/requests/:userId
func (s *Server) SendFriendRequest(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	targetUserID, err := c.ParamsInt("userId")
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid user ID"))
	}

	// Cannot send friend request to yourself
	if userID == uint(targetUserID) {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Cannot send friend request to yourself"))
	}

	// Check if target user exists
	_, err = s.userRepo.GetByID(ctx, uint(targetUserID))
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	// Check if friendship already exists
	existing, err := s.friendRepo.GetFriendshipBetweenUsers(ctx, userID, uint(targetUserID))
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}
	if existing != nil {
		switch existing.Status {
		case models.FriendshipStatusAccepted:
			return models.RespondWithError(c, fiber.StatusConflict,
				models.NewValidationError("You are already friends"))
		case models.FriendshipStatusPending:
			if existing.RequesterID == userID {
				return models.RespondWithError(c, fiber.StatusConflict,
					models.NewValidationError("Friend request already sent"))
			}
			return models.RespondWithError(c, fiber.StatusConflict,
				models.NewValidationError("You already have a pending friend request from this user"))
		}
	}

	// Create friend request
	friendship := &models.Friendship{
		RequesterID: userID,
		AddresseeID: uint(targetUserID),
		Status:      models.FriendshipStatusPending,
	}

	if err := s.friendRepo.Create(ctx, friendship); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	// Load full friendship for response
	friendship, err = s.friendRepo.GetByID(ctx, friendship.ID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.Status(fiber.StatusCreated).JSON(friendship)
}

// GetPendingRequests handles GET /api/friends/requests
func (s *Server) GetPendingRequests(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)

	requests, err := s.friendRepo.GetPendingRequests(ctx, userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(requests)
}

// GetSentRequests handles GET /api/friends/requests/sent
func (s *Server) GetSentRequests(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)

	requests, err := s.friendRepo.GetSentRequests(ctx, userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(requests)
}

// AcceptFriendRequest handles POST /api/friends/requests/:requestId/accept
func (s *Server) AcceptFriendRequest(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	requestID, err := c.ParamsInt("requestId")
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request ID"))
	}

	// Get the friendship request
	friendship, err := s.friendRepo.GetByID(ctx, uint(requestID))
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	// Check if user is the addressee
	if friendship.AddresseeID != userID {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("You can only accept friend requests sent to you"))
	}

	// Check if already accepted
	if friendship.Status != models.FriendshipStatusPending {
		return models.RespondWithError(c, fiber.StatusConflict,
			models.NewValidationError("Friend request is not pending"))
	}

	// Accept the request
	if err := s.friendRepo.UpdateStatus(ctx, uint(requestID), models.FriendshipStatusAccepted); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	// Get updated friendship
	friendship, err = s.friendRepo.GetByID(ctx, uint(requestID))
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(friendship)
}

// RejectFriendRequest handles POST /api/friends/requests/:requestId/reject
func (s *Server) RejectFriendRequest(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	requestID, err := c.ParamsInt("requestId")
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request ID"))
	}

	// Get the friendship request
	friendship, err := s.friendRepo.GetByID(ctx, uint(requestID))
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	// Check if user is the addressee
	if friendship.AddresseeID != userID {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewUnauthorizedError("You can only reject friend requests sent to you"))
	}

	// Check if already processed
	if friendship.Status != models.FriendshipStatusPending {
		return models.RespondWithError(c, fiber.StatusConflict,
			models.NewValidationError("Friend request is not pending"))
	}

	// Delete the request (reject)
	if err := s.friendRepo.Delete(ctx, uint(requestID)); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.SendStatus(fiber.StatusOK)
}

// GetFriends handles GET /api/friends
func (s *Server) GetFriends(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)

	friends, err := s.friendRepo.GetFriends(ctx, userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	// Hide passwords
	for i := range friends {
		friends[i].Password = ""
	}

	return c.JSON(friends)
}

// GetFriendshipStatus handles GET /api/friends/status/:userId
func (s *Server) GetFriendshipStatus(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	targetUserID, err := c.ParamsInt("userId")
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid user ID"))
	}

	// Check if target user exists
	_, err = s.userRepo.GetByID(ctx, uint(targetUserID))
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound, err)
	}

	// Get friendship status
	friendship, err := s.friendRepo.GetFriendshipBetweenUsers(ctx, userID, uint(targetUserID))
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	status := "none"
	if friendship != nil {
		status = string(friendship.Status)
	}

	return c.JSON(fiber.Map{
		"status":     status,
		"friendship": friendship,
	})
}

// RemoveFriend handles DELETE /api/friends/:userId
func (s *Server) RemoveFriend(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)
	targetUserID, err := c.ParamsInt("userId")
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid user ID"))
	}

	// Check if friendship exists and is accepted
	friendship, err := s.friendRepo.GetFriendshipBetweenUsers(ctx, userID, uint(targetUserID))
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}
	if friendship == nil || friendship.Status != models.FriendshipStatusAccepted {
		return models.RespondWithError(c, fiber.StatusNotFound,
			models.NewNotFoundError("Friendship", 0))
	}

	// Remove friendship
	if err := s.friendRepo.RemoveFriendship(ctx, userID, uint(targetUserID)); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.SendStatus(fiber.StatusOK)
}
