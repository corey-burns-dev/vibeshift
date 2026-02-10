// Package server contains HTTP and WebSocket handlers for the application's API endpoints.
package server

import (
	"time"

	"sanctum/internal/models"

	"github.com/gofiber/fiber/v2"
)

// CreateStreamRequest represents the request body for creating a stream
type CreateStreamRequest struct {
	Title        string `json:"title" validate:"required,min=1,max=255"`
	Description  string `json:"description"`
	ThumbnailURL string `json:"thumbnail_url"`
	StreamURL    string `json:"stream_url" validate:"required"`
	StreamType   string `json:"stream_type" validate:"required,oneof=youtube twitch hls iframe"`
	Category     string `json:"category"`
	Tags         string `json:"tags"`
}

// UpdateStreamRequest represents the request body for updating a stream
type UpdateStreamRequest struct {
	Title        string `json:"title"`
	Description  string `json:"description"`
	ThumbnailURL string `json:"thumbnail_url"`
	StreamURL    string `json:"stream_url"`
	StreamType   string `json:"stream_type"`
	Category     string `json:"category"`
	Tags         string `json:"tags"`
}

// GetStreams returns all live streams with optional filtering
// @Summary Get live streams
// @Tags Streams
// @Produce json
// @Param category query string false "Filter by category"
// @Param limit query int false "Limit results" default(20)
// @Param offset query int false "Offset for pagination" default(0)
// @Success 200 {object} map[string]interface{}
// @Router /streams [get]
func (s *Server) GetStreams(c *fiber.Ctx) error {
	category := c.Query("category", "")
	page := parsePagination(c, 20)

	if page.Limit > 50 {
		page.Limit = 50
	}

	streams, total, err := s.streamRepo.GetLiveStreams(c.Context(), category, page.Limit, page.Offset)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError,
			models.NewInternalError(err))
	}

	return c.JSON(fiber.Map{
		"streams": streams,
		"total":   total,
		"limit":   page.Limit,
		"offset":  page.Offset,
	})
}

// GetStream returns a single stream by ID
// @Summary Get stream by ID
// @Tags Streams
// @Produce json
// @Param id path int true "Stream ID"
// @Success 200 {object} models.Stream
// @Router /streams/{id} [get]
func (s *Server) GetStream(c *fiber.Ctx) error {
	id, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	stream, err := s.streamRepo.GetStreamByID(c.Context(), id)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound,
			models.NewNotFoundError("Stream", id))
	}

	return c.JSON(stream)
}

// CreateStream creates a new stream
// @Summary Create a new stream
// @Tags Streams
// @Accept json
// @Produce json
// @Param stream body CreateStreamRequest true "Stream data"
// @Success 201 {object} models.Stream
// @Router /streams [post]
func (s *Server) CreateStream(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)

	var req CreateStreamRequest
	if err := c.BodyParser(&req); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	if req.Title == "" {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Title is required"))
	}

	if req.StreamURL == "" {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Stream URL is required"))
	}

	stream := &models.Stream{
		UserID:       userID,
		Title:        req.Title,
		Description:  req.Description,
		ThumbnailURL: req.ThumbnailURL,
		StreamURL:    req.StreamURL,
		StreamType:   req.StreamType,
		Category:     req.Category,
		Tags:         req.Tags,
		IsLive:       false,
	}

	if err := s.streamRepo.CreateStream(c.Context(), stream); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError,
			models.NewInternalError(err))
	}

	// Fetch the complete stream with user
	stream, _ = s.streamRepo.GetStreamByID(c.Context(), stream.ID)

	return c.Status(fiber.StatusCreated).JSON(stream)
}

// UpdateStream updates an existing stream
// @Summary Update a stream
// @Tags Streams
// @Accept json
// @Produce json
// @Param id path int true "Stream ID"
// @Param stream body UpdateStreamRequest true "Stream data"
// @Success 200 {object} models.Stream
// @Router /streams/{id} [put]
func (s *Server) UpdateStream(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)

	id, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	stream, err := s.streamRepo.GetStreamByID(c.Context(), id)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound,
			models.NewNotFoundError("Stream", id))
	}

	if stream.UserID != userID {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewForbiddenError("You can only update your own streams"))
	}

	var req UpdateStreamRequest
	if err := c.BodyParser(&req); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	// Update only non-empty fields
	if req.Title != "" {
		stream.Title = req.Title
	}
	if req.Description != "" {
		stream.Description = req.Description
	}
	if req.ThumbnailURL != "" {
		stream.ThumbnailURL = req.ThumbnailURL
	}
	if req.StreamURL != "" {
		stream.StreamURL = req.StreamURL
	}
	if req.StreamType != "" {
		stream.StreamType = req.StreamType
	}
	if req.Category != "" {
		stream.Category = req.Category
	}
	if req.Tags != "" {
		stream.Tags = req.Tags
	}

	if err := s.streamRepo.UpdateStream(c.Context(), stream); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError,
			models.NewInternalError(err))
	}

	return c.JSON(stream)
}

// DeleteStream deletes a stream
// @Summary Delete a stream
// @Tags Streams
// @Param id path int true "Stream ID"
// @Success 204
// @Router /streams/{id} [delete]
func (s *Server) DeleteStream(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)

	id, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	stream, err := s.streamRepo.GetStreamByID(c.Context(), id)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound,
			models.NewNotFoundError("Stream", id))
	}

	if stream.UserID != userID {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewForbiddenError("You can only delete your own streams"))
	}

	if err := s.streamRepo.DeleteStream(c.Context(), id); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError,
			models.NewInternalError(err))
	}

	return c.SendStatus(fiber.StatusNoContent)
}

// GoLive starts a stream
// @Summary Start streaming (go live)
// @Tags Streams
// @Param id path int true "Stream ID"
// @Success 200 {object} models.Stream
// @Router /streams/{id}/go-live [post]
func (s *Server) GoLive(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)

	id, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	stream, err := s.streamRepo.GetStreamByID(c.Context(), id)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound,
			models.NewNotFoundError("Stream", id))
	}

	if stream.UserID != userID {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewForbiddenError("You can only go live on your own streams"))
	}

	if stream.IsLive {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Stream is already live"))
	}

	if err := s.streamRepo.SetStreamLive(c.Context(), id, true); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError,
			models.NewInternalError(err))
	}

	// Fetch updated stream
	stream, _ = s.streamRepo.GetStreamByID(c.Context(), id)

	return c.JSON(stream)
}

// EndStream ends a live stream
// @Summary End streaming
// @Tags Streams
// @Param id path int true "Stream ID"
// @Success 200 {object} models.Stream
// @Router /streams/{id}/end [post]
func (s *Server) EndStream(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)

	id, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	stream, err := s.streamRepo.GetStreamByID(c.Context(), id)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound,
			models.NewNotFoundError("Stream", id))
	}

	if stream.UserID != userID {
		return models.RespondWithError(c, fiber.StatusForbidden,
			models.NewForbiddenError("You can only end your own streams"))
	}

	if !stream.IsLive {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Stream is not live"))
	}

	if err := s.streamRepo.SetStreamLive(c.Context(), id, false); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError,
			models.NewInternalError(err))
	}

	// Fetch updated stream
	stream, _ = s.streamRepo.GetStreamByID(c.Context(), id)

	return c.JSON(stream)
}

// GetMyStreams returns all streams for the authenticated user
// @Summary Get my streams
// @Tags Streams
// @Produce json
// @Success 200 {array} models.Stream
// @Router /streams/me [get]
func (s *Server) GetMyStreams(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)

	streams, err := s.streamRepo.GetStreamsByUserID(c.Context(), userID)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError,
			models.NewInternalError(err))
	}

	return c.JSON(streams)
}

// GetStreamMessages returns chat messages for a stream
// @Summary Get stream chat messages
// @Tags Streams
// @Produce json
// @Param id path int true "Stream ID"
// @Param limit query int false "Limit results" default(50)
// @Param offset query int false "Offset for pagination" default(0)
// @Success 200 {array} models.StreamMessage
// @Router /streams/{id}/messages [get]
func (s *Server) GetStreamMessages(c *fiber.Ctx) error {
	id, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	page := parsePagination(c, 50)

	if page.Limit > 100 {
		page.Limit = 100
	}

	messages, err := s.streamRepo.GetStreamMessages(c.Context(), id, page.Limit, page.Offset)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError,
			models.NewInternalError(err))
	}

	return c.JSON(messages)
}

// SendStreamMessage posts a chat message to a stream
// @Summary Send stream chat message
// @Tags Streams
// @Accept json
// @Produce json
// @Param id path int true "Stream ID"
// @Param message body map[string]string true "Message content"
// @Success 201 {object} models.StreamMessage
// @Router /streams/{id}/messages [post]
func (s *Server) SendStreamMessage(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)

	id, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	// Verify stream exists
	_, err = s.streamRepo.GetStreamByID(c.Context(), id)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusNotFound,
			models.NewNotFoundError("Stream", id))
	}

	var req struct {
		Content string `json:"content"`
	}
	if err := c.BodyParser(&req); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	if req.Content == "" {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Message content is required"))
	}

	msg := &models.StreamMessage{
		StreamID:  id,
		UserID:    userID,
		Content:   req.Content,
		CreatedAt: time.Now(),
	}

	if err := s.streamRepo.CreateStreamMessage(c.Context(), msg); err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError,
			models.NewInternalError(err))
	}

	// Fetch message with user
	user, _ := s.userRepo.GetByID(c.Context(), userID)
	if user != nil {
		msg.User = *user
	}

	return c.Status(fiber.StatusCreated).JSON(msg)
}

// GetStreamCategories returns available stream categories
// @Summary Get stream categories
// @Tags Streams
// @Produce json
// @Success 200 {array} string
// @Router /streams/categories [get]
func (s *Server) GetStreamCategories(c *fiber.Ctx) error {
	return c.JSON(models.StreamCategories)
}
