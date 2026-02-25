package server

import (
	"io"
	"strings"

	"sanctum/internal/models"
	"sanctum/internal/service"

	"github.com/gofiber/fiber/v2"
)

// ImageUploadResponse is the API response after uploading an image.
type ImageUploadResponse struct {
	ID        uint              `json:"id"`
	Hash      string            `json:"hash"`
	Status    string            `json:"status"`
	Width     int               `json:"width"`
	Height    int               `json:"height"`
	CropMode  string            `json:"crop_mode"`
	SizeBytes int64             `json:"size_bytes"`
	MimeType  string            `json:"mime_type"`
	URL       string            `json:"url"`
	Variants  map[string]string `json:"variants"`
}

// ImageStatusResponse is the API response for image status/polling.
type ImageStatusResponse struct {
	Status   string            `json:"status"`
	CropMode string            `json:"crop_mode"`
	URL      string            `json:"url"`
	Variants map[string]string `json:"variants"`
}

// UploadImage handles POST /api/images/upload
func (s *Server) UploadImage(c *fiber.Ctx) error {
	userID := c.Locals("userID").(uint)
	file, err := c.FormFile("image")
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest, models.NewValidationError("No file uploaded"))
	}

	src, err := file.Open()
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest, models.NewValidationError("Unable to read uploaded file"))
	}
	defer func() { _ = src.Close() }()

	content, err := io.ReadAll(src)
	if err != nil {
		return models.RespondWithError(c, fiber.StatusBadRequest, models.NewValidationError("Unable to read uploaded file"))
	}

	uploaded, err := s.imageSvc().Upload(c.UserContext(), service.UploadImageInput{
		UserID:      userID,
		Filename:    file.Filename,
		ContentType: file.Header.Get("Content-Type"),
		Content:     content,
	})
	if err != nil {
		return models.RespondWithError(c, mapServiceError(err), err)
	}

	return c.JSON(toImageUploadResponse(s.imageSvc(), uploaded))
}

// GetImageStatus handles GET /api/images/:hash/status
func (s *Server) GetImageStatus(c *fiber.Ctx) error {
	hash := strings.TrimSpace(c.Params("hash"))
	img, err := s.imageSvc().GetByHashWithVariants(c.UserContext(), hash)
	if err != nil {
		return models.RespondWithError(c, mapServiceError(err), err)
	}

	return c.JSON(ImageStatusResponse{
		Status:   img.Status,
		CropMode: img.CropMode,
		URL:      s.imageSvc().BuildMasterImageURL(img.Hash),
		Variants: s.imageSvc().BuildVariantsMap(img.Hash, img.Variants),
	})
}

// ServeImage is deprecated and now redirects to canonical media URLs.
func (s *Server) ServeImage(c *fiber.Ctx) error {
	hash := strings.TrimSpace(c.Params("hash"))
	if hash == "" {
		return models.RespondWithError(c, fiber.StatusBadRequest, models.NewValidationError("Invalid image hash"))
	}
	// Validate the hash is strictly hex to prevent path traversal
	for _, ch := range hash {
		if (ch < '0' || ch > '9') && (ch < 'a' || ch > 'f') {
			return models.RespondWithError(c, fiber.StatusBadRequest, models.NewValidationError("Invalid image hash"))
		}
	}
	return c.Redirect(s.imageSvc().BuildMasterImageURL(hash), fiber.StatusMovedPermanently)
}

func toImageUploadResponse(imageSvc *service.ImageService, image *models.Image) ImageUploadResponse {
	return ImageUploadResponse{
		ID:        image.ID,
		Hash:      image.Hash,
		Status:    image.Status,
		Width:     image.Width,
		Height:    image.Height,
		CropMode:  image.CropMode,
		SizeBytes: image.SizeBytes,
		MimeType:  image.MimeType,
		URL:       imageSvc.BuildMasterImageURL(image.Hash),
		Variants:  imageSvc.BuildVariantsMap(image.Hash, image.Variants),
	}
}

func (s *Server) imageSvc() *service.ImageService {
	return s.imageService
}
