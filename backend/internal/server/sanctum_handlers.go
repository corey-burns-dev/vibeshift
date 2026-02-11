package server

import (
	"errors"
	"strings"
	"time"

	"sanctum/internal/models"
	"sanctum/internal/validation"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// SanctumDTO is the API response model for sanctum endpoints.
type SanctumDTO struct {
	ID                uint                 `json:"id"`
	Name              string               `json:"name"`
	Slug              string               `json:"slug"`
	Description       string               `json:"description"`
	CreatedByUserID   *uint                `json:"created_by_user_id"`
	Status            models.SanctumStatus `json:"status"`
	CreatedAt         string               `json:"created_at"`
	UpdatedAt         string               `json:"updated_at"`
	DefaultChatRoomID *uint                `json:"default_chat_room_id"`
}

// SanctumMembershipDTO is the API response model for sanctum memberships.
type SanctumMembershipDTO struct {
	SanctumID uint                         `json:"sanctum_id"`
	UserID    uint                         `json:"user_id"`
	Role      models.SanctumMembershipRole `json:"role"`
	CreatedAt string                       `json:"created_at"`
	UpdatedAt string                       `json:"updated_at"`
	Sanctum   SanctumDTO                   `json:"sanctum"`
}

func toSanctumDTO(s models.Sanctum, defaultRoomID *uint) SanctumDTO {
	return SanctumDTO{
		ID:                s.ID,
		Name:              s.Name,
		Slug:              s.Slug,
		Description:       s.Description,
		CreatedByUserID:   s.CreatedByUserID,
		Status:            s.Status,
		CreatedAt:         s.CreatedAt.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
		UpdatedAt:         s.UpdatedAt.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
		DefaultChatRoomID: defaultRoomID,
	}
}

func toSanctumMembershipDTO(m models.SanctumMembership, sanctum models.Sanctum, defaultRoomID *uint) SanctumMembershipDTO {
	return SanctumMembershipDTO{
		SanctumID: m.SanctumID,
		UserID:    m.UserID,
		Role:      m.Role,
		CreatedAt: m.CreatedAt.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
		UpdatedAt: m.UpdatedAt.UTC().Format("2006-01-02T15:04:05.999999999Z07:00"),
		Sanctum:   toSanctumDTO(sanctum, defaultRoomID),
	}
}

// GetSanctums handles GET /api/sanctums
// @Summary List sanctums
// @Description List active sanctums.
// @Tags sanctums
// @Produce json
// @Success 200 {array} SanctumDTO
// @Router /sanctums [get]
func (s *Server) GetSanctums(c *fiber.Ctx) error {
	ctx := c.Context()

	var sanctums []models.Sanctum
	if err := s.db.WithContext(ctx).
		Where("status = ?", models.SanctumStatusActive).
		Order("name ASC").
		Find(&sanctums).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	ids := make([]uint, 0, len(sanctums))
	for _, sanctum := range sanctums {
		ids = append(ids, sanctum.ID)
	}

	roomBySanctumID := map[uint]uint{}
	if len(ids) > 0 {
		var rooms []models.Conversation
		if err := s.db.WithContext(ctx).
			Select("id", "sanctum_id").
			Where("sanctum_id IN ?", ids).
			Find(&rooms).Error; err != nil {
			return models.RespondWithError(c, fiber.StatusInternalServerError, err)
		}
		for _, room := range rooms {
			if room.SanctumID != nil {
				roomBySanctumID[*room.SanctumID] = room.ID
			}
		}
	}

	resp := make([]SanctumDTO, 0, len(sanctums))
	for _, sanctum := range sanctums {
		var roomID *uint
		if id, ok := roomBySanctumID[sanctum.ID]; ok {
			roomID = &id
		}
		resp = append(resp, toSanctumDTO(sanctum, roomID))
	}

	return c.JSON(resp)
}

// GetSanctumBySlug handles GET /api/sanctums/:slug
// @Summary Get sanctum by slug
// @Description Fetch active sanctum detail by slug.
// @Tags sanctums
// @Produce json
// @Param slug path string true "Sanctum slug"
// @Success 200 {object} SanctumDTO
// @Failure 404 {object} models.ErrorResponse
// @Router /sanctums/{slug} [get]
func (s *Server) GetSanctumBySlug(c *fiber.Ctx) error {
	ctx := c.Context()
	slug := strings.TrimSpace(c.Params("slug"))
	if slug == "" {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("slug is required"))
	}

	var sanctum models.Sanctum
	if err := s.db.WithContext(ctx).
		Where("slug = ? AND status = ?", slug, models.SanctumStatusActive).
		First(&sanctum).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.RespondWithError(c, fiber.StatusNotFound,
				models.NewNotFoundError("Sanctum", slug))
		}
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	var room models.Conversation
	var roomID *uint
	if err := s.db.WithContext(ctx).Select("id").Where("sanctum_id = ?", sanctum.ID).First(&room).Error; err == nil {
		roomID = &room.ID
	} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(toSanctumDTO(sanctum, roomID))
}

// CreateSanctumRequest handles POST /api/sanctums/requests
// @Summary Create sanctum request
// @Description Submit a request for a new sanctum.
// @Tags sanctums
// @Accept json
// @Produce json
// @Param request body object{requested_name=string,requested_slug=string,reason=string} true "Sanctum request"
// @Success 201 {object} models.SanctumRequest
// @Failure 400 {object} models.ErrorResponse
// @Failure 409 {object} models.ErrorResponse
// @Security BearerAuth
// @Router /sanctums/requests [post]
func (s *Server) CreateSanctumRequest(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)

	var req struct {
		RequestedName string `json:"requested_name"`
		RequestedSlug string `json:"requested_slug"`
		Reason        string `json:"reason"`
	}
	if err := c.BodyParser(&req); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}

	req.RequestedName = strings.TrimSpace(req.RequestedName)
	req.RequestedSlug = strings.TrimSpace(req.RequestedSlug)
	req.Reason = strings.TrimSpace(req.Reason)

	if req.RequestedName == "" || req.Reason == "" {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("requested_name, requested_slug, and reason are required"))
	}
	if err := validation.ValidateSanctumSlug(req.RequestedSlug); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest, models.NewValidationError(err.Error()))
	}

	var existingCount int64
	if err := s.db.WithContext(ctx).Model(&models.Sanctum{}).Where("slug = ?", req.RequestedSlug).Count(&existingCount).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}
	if existingCount > 0 {
		return models.RespondWithError(c, fiber.StatusConflict,
			models.NewValidationError("slug is already in use"))
	}

	var pendingCount int64
	if err := s.db.WithContext(ctx).Model(&models.SanctumRequest{}).
		Where("requested_slug = ? AND status = ?", req.RequestedSlug, models.SanctumRequestStatusPending).
		Count(&pendingCount).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}
	if pendingCount > 0 {
		return models.RespondWithError(c, fiber.StatusConflict,
			models.NewValidationError("a pending request already exists for this slug"))
	}

	create := models.SanctumRequest{
		RequestedName:     req.RequestedName,
		RequestedSlug:     req.RequestedSlug,
		Reason:            req.Reason,
		RequestedByUserID: userID,
		Status:            models.SanctumRequestStatusPending,
	}
	if err := s.db.WithContext(ctx).Create(&create).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	s.publishAdminEvent(EventSanctumRequestCreated, map[string]interface{}{
		"id":                 create.ID,
		"requested_name":     create.RequestedName,
		"requested_slug":     create.RequestedSlug,
		"requested_by_user":  create.RequestedByUserID,
		"status":             create.Status,
		"created_at":         create.CreatedAt.Format(time.RFC3339Nano),
	})

	return c.Status(fiber.StatusCreated).JSON(create)
}

// GetMySanctumRequests handles GET /api/sanctums/requests/me
// @Summary Get my sanctum requests
// @Description List sanctum requests submitted by the current user.
// @Tags sanctums
// @Produce json
// @Success 200 {array} models.SanctumRequest
// @Security BearerAuth
// @Router /sanctums/requests/me [get]
func (s *Server) GetMySanctumRequests(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)

	var requests []models.SanctumRequest
	if err := s.db.WithContext(ctx).
		Preload("ReviewedByUser").
		Where("requested_by_user_id = ?", userID).
		Order("created_at DESC").
		Find(&requests).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(requests)
}

// GetMySanctumMemberships handles GET /api/sanctums/memberships/me
// @Summary Get my sanctum memberships
// @Description List sanctum memberships for the current user.
// @Tags sanctums
// @Produce json
// @Success 200 {array} SanctumMembershipDTO
// @Security BearerAuth
// @Router /sanctums/memberships/me [get]
func (s *Server) GetMySanctumMemberships(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)

	var memberships []models.SanctumMembership
	if err := s.db.WithContext(ctx).
		Preload("Sanctum").
		Where("user_id = ?", userID).
		Order("created_at ASC").
		Find(&memberships).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	sanctumIDs := make([]uint, 0, len(memberships))
	sanctumsByID := make(map[uint]models.Sanctum, len(memberships))
	for _, membership := range memberships {
		if membership.Sanctum != nil {
			sanctumIDs = append(sanctumIDs, membership.SanctumID)
			sanctumsByID[membership.SanctumID] = *membership.Sanctum
		}
	}

	roomBySanctumID := map[uint]uint{}
	if len(sanctumIDs) > 0 {
		var rooms []models.Conversation
		if err := s.db.WithContext(ctx).
			Select("id", "sanctum_id").
			Where("sanctum_id IN ?", sanctumIDs).
			Find(&rooms).Error; err != nil {
			return models.RespondWithError(c, fiber.StatusInternalServerError, err)
		}
		for _, room := range rooms {
			if room.SanctumID != nil {
				roomBySanctumID[*room.SanctumID] = room.ID
			}
		}
	}

	resp := make([]SanctumMembershipDTO, 0, len(memberships))
	for _, membership := range memberships {
		sanctum, ok := sanctumsByID[membership.SanctumID]
		if !ok {
			continue
		}
		var roomID *uint
		if id, found := roomBySanctumID[membership.SanctumID]; found {
			roomID = &id
		}
		resp = append(resp, toSanctumMembershipDTO(membership, sanctum, roomID))
	}

	return c.JSON(resp)
}

// UpsertMySanctumMemberships handles POST /api/sanctums/memberships/bulk
// @Summary Save sanctums I follow
// @Description Upsert current user's followed sanctums by slug and keep owner/mod memberships intact.
// @Tags sanctums
// @Accept json
// @Produce json
// @Param request body object{sanctum_slugs=[]string} true "Sanctum follow list"
// @Success 200 {array} SanctumMembershipDTO
// @Failure 400 {object} models.ErrorResponse
// @Security BearerAuth
// @Router /sanctums/memberships/bulk [post]
func (s *Server) UpsertMySanctumMemberships(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := c.Locals("userID").(uint)

	var body struct {
		SanctumSlugs []string `json:"sanctum_slugs"`
	}
	if err := c.BodyParser(&body); err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("Invalid request body"))
	}
	if len(body.SanctumSlugs) == 0 {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("sanctum_slugs is required"))
	}

	uniqueSlugs := make([]string, 0, len(body.SanctumSlugs))
	seen := make(map[string]struct{}, len(body.SanctumSlugs))
	for _, raw := range body.SanctumSlugs {
		slug := strings.TrimSpace(strings.ToLower(raw))
		if slug == "" {
			return models.RespondWithError(c, fiber.StatusBadRequest,
				models.NewValidationError("sanctum_slugs cannot contain empty values"))
		}
		if _, ok := seen[slug]; ok {
			continue
		}
		seen[slug] = struct{}{}
		uniqueSlugs = append(uniqueSlugs, slug)
	}

	var sanctums []models.Sanctum
	if err := s.db.WithContext(ctx).
		Where("slug IN ? AND status = ?", uniqueSlugs, models.SanctumStatusActive).
		Find(&sanctums).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}
	if len(sanctums) != len(uniqueSlugs) {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("one or more sanctum_slugs are invalid"))
	}

	sanctumIDs := make([]uint, 0, len(sanctums))
	sanctumsByID := make(map[uint]models.Sanctum, len(sanctums))
	for _, sanctum := range sanctums {
		sanctumIDs = append(sanctumIDs, sanctum.ID)
		sanctumsByID[sanctum.ID] = sanctum
	}

	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.
			Where("user_id = ? AND role = ? AND sanctum_id NOT IN ?", userID, models.SanctumMembershipRoleMember, sanctumIDs).
			Delete(&models.SanctumMembership{}).Error; err != nil {
			return err
		}

		for _, sanctumID := range sanctumIDs {
			membership := models.SanctumMembership{
				SanctumID: sanctumID,
				UserID:    userID,
				Role:      models.SanctumMembershipRoleMember,
			}
			if err := tx.Clauses(clause.OnConflict{
				Columns:   []clause.Column{{Name: "sanctum_id"}, {Name: "user_id"}},
				DoUpdates: clause.Assignments(map[string]any{"updated_at": gorm.Expr("NOW()")}),
			}).Create(&membership).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	var memberships []models.SanctumMembership
	if err := s.db.WithContext(ctx).
		Where("user_id = ? AND sanctum_id IN ?", userID, sanctumIDs).
		Order("created_at ASC").
		Find(&memberships).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	roomBySanctumID := map[uint]uint{}
	var rooms []models.Conversation
	if err := s.db.WithContext(ctx).
		Select("id", "sanctum_id").
		Where("sanctum_id IN ?", sanctumIDs).
		Find(&rooms).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}
	for _, room := range rooms {
		if room.SanctumID != nil {
			roomBySanctumID[*room.SanctumID] = room.ID
		}
	}

	resp := make([]SanctumMembershipDTO, 0, len(memberships))
	for _, membership := range memberships {
		sanctum, ok := sanctumsByID[membership.SanctumID]
		if !ok {
			continue
		}
		var roomID *uint
		if id, found := roomBySanctumID[membership.SanctumID]; found {
			roomID = &id
		}
		resp = append(resp, toSanctumMembershipDTO(membership, sanctum, roomID))
	}

	return c.JSON(resp)
}

// GetAdminSanctumRequests handles GET /api/admin/sanctum-requests
// @Summary List sanctum requests for admins
// @Description List sanctum requests by status. Defaults to pending.
// @Tags sanctums-admin
// @Produce json
// @Param status query string false "Filter status"
// @Success 200 {array} models.SanctumRequest
// @Security BearerAuth
// @Router /admin/sanctum-requests [get]
func (s *Server) GetAdminSanctumRequests(c *fiber.Ctx) error {
	ctx := c.Context()
	status := strings.TrimSpace(c.Query("status", string(models.SanctumRequestStatusPending)))

	allowed := map[string]models.SanctumRequestStatus{
		string(models.SanctumRequestStatusPending):  models.SanctumRequestStatusPending,
		string(models.SanctumRequestStatusApproved): models.SanctumRequestStatusApproved,
		string(models.SanctumRequestStatusRejected): models.SanctumRequestStatusRejected,
	}
	statusEnum, ok := allowed[status]
	if !ok {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("status must be one of: pending, approved, rejected"))
	}

	var requests []models.SanctumRequest
	if err := s.db.WithContext(ctx).
		Preload("RequestedByUser").
		Preload("ReviewedByUser").
		Where("status = ?", statusEnum).
		Order("created_at ASC").
		Find(&requests).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	return c.JSON(requests)
}

// ApproveSanctumRequest handles POST /api/admin/sanctum-requests/:id/approve
// @Summary Approve sanctum request
// @Description Approve a pending sanctum request and create sanctum, owner membership, and default chat room.
// @Tags sanctums-admin
// @Accept json
// @Produce json
// @Param id path int true "Request ID"
// @Param request body object{review_notes=string} false "Optional review notes"
// @Success 200 {object} object{request=models.SanctumRequest,sanctum=SanctumDTO}
// @Failure 400 {object} models.ErrorResponse
// @Failure 404 {object} models.ErrorResponse
// @Security BearerAuth
// @Router /admin/sanctum-requests/{id}/approve [post]
func (s *Server) ApproveSanctumRequest(c *fiber.Ctx) error {
	ctx := c.Context()
	reviewerID := c.Locals("userID").(uint)
	requestID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	var body struct {
		ReviewNotes string `json:"review_notes"`
	}
	if len(c.Body()) > 0 {
		if err := c.BodyParser(&body); err != nil {
			return models.RespondWithError(c, fiber.StatusBadRequest,
				models.NewValidationError("Invalid request body"))
		}
	}

	var approvedRequest models.SanctumRequest
	var createdSanctum models.Sanctum
	var defaultRoom models.Conversation

	txErr := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&approvedRequest, requestID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return models.NewNotFoundError("Sanctum request", requestID)
			}
			return err
		}

		if approvedRequest.Status != models.SanctumRequestStatusPending {
			return models.NewValidationError("sanctum request is not pending")
		}

		if err := validation.ValidateSanctumSlug(approvedRequest.RequestedSlug); err != nil {
			return models.NewValidationError(err.Error())
		}

		var existingCount int64
		if err := tx.Model(&models.Sanctum{}).
			Where("slug = ?", approvedRequest.RequestedSlug).
			Count(&existingCount).Error; err != nil {
			return err
		}
		if existingCount > 0 {
			return models.NewValidationError("slug is already in use")
		}

		createdSanctum = models.Sanctum{
			Name:            approvedRequest.RequestedName,
			Slug:            approvedRequest.RequestedSlug,
			Description:     approvedRequest.Reason,
			CreatedByUserID: &approvedRequest.RequestedByUserID,
			Status:          models.SanctumStatusActive,
		}
		if err := tx.Create(&createdSanctum).Error; err != nil {
			return err
		}

		membership := models.SanctumMembership{
			SanctumID: createdSanctum.ID,
			UserID:    approvedRequest.RequestedByUserID,
			Role:      models.SanctumMembershipRoleOwner,
		}
		if err := tx.Create(&membership).Error; err != nil {
			return err
		}

		defaultRoom = models.Conversation{
			Name:      createdSanctum.Name,
			IsGroup:   true,
			CreatedBy: approvedRequest.RequestedByUserID,
			SanctumID: &createdSanctum.ID,
		}
		if err := tx.Create(&defaultRoom).Error; err != nil {
			return err
		}

		approvedRequest.Status = models.SanctumRequestStatusApproved
		approvedRequest.ReviewedByUserID = &reviewerID
		approvedRequest.ReviewNotes = strings.TrimSpace(body.ReviewNotes)
		if err := tx.Save(&approvedRequest).Error; err != nil {
			return err
		}

		return nil
	})
	if txErr != nil {
		var appErr *models.AppError
		if errors.As(txErr, &appErr) {
			status := fiber.StatusBadRequest
			if appErr.Code == "NOT_FOUND" {
				status = fiber.StatusNotFound
			}
			return models.RespondWithError(c, status, appErr)
		}
		return models.RespondWithError(c, fiber.StatusInternalServerError, txErr)
	}

	roomID := defaultRoom.ID
	resp := fiber.Map{
		"request": approvedRequest,
		"sanctum": toSanctumDTO(createdSanctum, &roomID),
	}

	s.publishBroadcastEvent(EventSanctumRequestReviewed, map[string]interface{}{
		"id":         approvedRequest.ID,
		"status":     approvedRequest.Status,
		"updated_at": approvedRequest.UpdatedAt.Format(time.RFC3339Nano),
	})

	return c.JSON(resp)
}

// RejectSanctumRequest handles POST /api/admin/sanctum-requests/:id/reject
// @Summary Reject sanctum request
// @Description Reject a pending sanctum request.
// @Tags sanctums-admin
// @Accept json
// @Produce json
// @Param id path int true "Request ID"
// @Param request body object{review_notes=string} false "Optional review notes"
// @Success 200 {object} models.SanctumRequest
// @Failure 400 {object} models.ErrorResponse
// @Failure 404 {object} models.ErrorResponse
// @Security BearerAuth
// @Router /admin/sanctum-requests/{id}/reject [post]
func (s *Server) RejectSanctumRequest(c *fiber.Ctx) error {
	ctx := c.Context()
	reviewerID := c.Locals("userID").(uint)
	requestID, err := s.parseID(c, "id")
	if err != nil {
		return nil
	}

	var body struct {
		ReviewNotes string `json:"review_notes"`
	}
	if len(c.Body()) > 0 {
		if err := c.BodyParser(&body); err != nil {
			return models.RespondWithError(c, fiber.StatusBadRequest,
				models.NewValidationError("Invalid request body"))
		}
	}

	var request models.SanctumRequest
	if err := s.db.WithContext(ctx).First(&request, requestID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return models.RespondWithError(c, fiber.StatusNotFound,
				models.NewNotFoundError("Sanctum request", requestID))
		}
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	if request.Status != models.SanctumRequestStatusPending {
		return models.RespondWithError(c, fiber.StatusBadRequest,
			models.NewValidationError("sanctum request is not pending"))
	}

	request.Status = models.SanctumRequestStatusRejected
	request.ReviewedByUserID = &reviewerID
	request.ReviewNotes = strings.TrimSpace(body.ReviewNotes)
	if err := s.db.WithContext(ctx).Save(&request).Error; err != nil {
		return models.RespondWithError(c, fiber.StatusInternalServerError, err)
	}

	s.publishBroadcastEvent(EventSanctumRequestReviewed, map[string]interface{}{
		"id":         request.ID,
		"status":     request.Status,
		"updated_at": request.UpdatedAt.Format(time.RFC3339Nano),
	})

	return c.JSON(request)
}
