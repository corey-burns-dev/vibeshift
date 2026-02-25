// Package testutil provides shared test doubles and fixtures for backend tests.
package testutil

import (
	"bytes"
	"context"
	"image"
	"image/png"
	"time"

	"sanctum/internal/models"
	"sanctum/internal/repository"

	"gorm.io/gorm"
)

// ImageRepoStub is an in-memory image repository implementation for tests.
type ImageRepoStub struct {
	items  map[string]*models.Image
	nextID uint
}

// NewImageRepoStub creates an in-memory image repository stub for tests.
func NewImageRepoStub() *ImageRepoStub {
	return &ImageRepoStub{items: make(map[string]*models.Image), nextID: 1}
}

// Create stores image metadata in-memory.
func (s *ImageRepoStub) Create(_ context.Context, img *models.Image) error {
	if img.ID == 0 {
		img.ID = s.nextID
		s.nextID++
	}
	now := time.Now().UTC()
	img.CreatedAt = now
	img.UpdatedAt = now
	s.items[img.Hash] = img
	return nil
}

// GetByHash fetches an image by content hash.
func (s *ImageRepoStub) GetByHash(_ context.Context, hash string) (*models.Image, error) {
	item, ok := s.items[hash]
	if !ok {
		return nil, gorm.ErrRecordNotFound
	}
	return item, nil
}

// GetByHashWithVariants fetches an image and its variants by hash.
func (s *ImageRepoStub) GetByHashWithVariants(ctx context.Context, hash string) (*models.Image, error) {
	return s.GetByHash(ctx, hash)
}

// UpdateLastAccessed updates LastAccessedAt for the matching image.
func (s *ImageRepoStub) UpdateLastAccessed(_ context.Context, imageID uint) error {
	for _, item := range s.items {
		if item.ID == imageID {
			now := time.Now().UTC()
			item.LastAccessedAt = &now
			return nil
		}
	}
	return gorm.ErrRecordNotFound
}

// UpsertVariant upserts a variant into the stored image record.
func (s *ImageRepoStub) UpsertVariant(_ context.Context, v *models.ImageVariant) error {
	for _, item := range s.items {
		if item.ID == v.ImageID {
			item.Variants = append(item.Variants, *v)
			return nil
		}
	}
	return gorm.ErrRecordNotFound
}

// GetVariantsByImageID returns variants for a given image ID.
func (s *ImageRepoStub) GetVariantsByImageID(_ context.Context, imageID uint) ([]models.ImageVariant, error) {
	for _, item := range s.items {
		if item.ID == imageID {
			return item.Variants, nil
		}
	}
	return nil, gorm.ErrRecordNotFound
}

// ClaimNextQueued marks and returns the next queued image.
func (s *ImageRepoStub) ClaimNextQueued(_ context.Context) (*models.Image, error) {
	for _, item := range s.items {
		if item.Status == repository.ImageStatusQueued {
			item.Status = repository.ImageStatusProcessing
			return item, nil
		}
	}
	return nil, gorm.ErrRecordNotFound
}

// MarkReady marks an image as ready.
func (s *ImageRepoStub) MarkReady(_ context.Context, imageID uint) error {
	for _, item := range s.items {
		if item.ID == imageID {
			item.Status = repository.ImageStatusReady
			return nil
		}
	}
	return gorm.ErrRecordNotFound
}

// MarkFailed marks an image as failed with an error message.
func (s *ImageRepoStub) MarkFailed(_ context.Context, imageID uint, errMsg string) error {
	for _, item := range s.items {
		if item.ID == imageID {
			item.Status = repository.ImageStatusFailed
			item.Error = errMsg
			return nil
		}
	}
	return gorm.ErrRecordNotFound
}

// RequeueStaleProcessing is a no-op for the in-memory stub.
func (s *ImageRepoStub) RequeueStaleProcessing(_ context.Context, _ time.Duration) (int64, error) {
	return 0, nil
}

// TinyPNG returns an in-memory PNG byte slice with the requested dimensions.
func TinyPNG(t interface {
	Helper()
	Fatalf(string, ...any)
}, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	buf := bytes.NewBuffer(nil)
	if err := png.Encode(buf, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	return buf.Bytes()
}
