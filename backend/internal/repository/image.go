package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"sanctum/internal/models"

	"gorm.io/gorm"
)

const (
	// ImageStatusQueued is the status for an image awaiting processing.
	ImageStatusQueued = "queued"
	// ImageStatusProcessing is the status for an image being processed.
	ImageStatusProcessing = "processing"
	// ImageStatusReady is the status for a processed image ready to serve.
	ImageStatusReady = "ready"
	// ImageStatusFailed is the status for a failed image processing.
	ImageStatusFailed = "failed"
)

// ImageRepository defines storage operations for uploaded images.
type ImageRepository interface {
	Create(ctx context.Context, image *models.Image) error
	GetByHash(ctx context.Context, hash string) (*models.Image, error)
	GetByHashWithVariants(ctx context.Context, hash string) (*models.Image, error)
	UpdateLastAccessed(ctx context.Context, id uint) error
	UpsertVariant(ctx context.Context, v *models.ImageVariant) error
	GetVariantsByImageID(ctx context.Context, imageID uint) ([]models.ImageVariant, error)
	ClaimNextQueued(ctx context.Context) (*models.Image, error)
	MarkReady(ctx context.Context, imageID uint) error
	MarkFailed(ctx context.Context, imageID uint, errMsg string) error
	RequeueStaleProcessing(ctx context.Context, olderThan time.Duration) (int64, error)
}

type imageRepository struct {
	db *gorm.DB
}

// NewImageRepository returns a repository implementation for image metadata.
func NewImageRepository(db *gorm.DB) ImageRepository {
	return &imageRepository{db: db}
}

func (r *imageRepository) Create(ctx context.Context, image *models.Image) error {
	return r.db.WithContext(ctx).Create(image).Error
}

func (r *imageRepository) GetByHash(ctx context.Context, hash string) (*models.Image, error) {
	var image models.Image
	if err := r.db.WithContext(ctx).Where("hash = ?", hash).First(&image).Error; err != nil {
		return nil, err
	}
	return &image, nil
}

func (r *imageRepository) GetByHashWithVariants(ctx context.Context, hash string) (*models.Image, error) {
	var image models.Image
	if err := r.db.WithContext(ctx).
		Preload("Variants").
		Where("hash = ?", hash).
		First(&image).Error; err != nil {
		return nil, err
	}
	return &image, nil
}

func (r *imageRepository) UpdateLastAccessed(ctx context.Context, id uint) error {
	now := time.Now().UTC()
	return r.db.WithContext(ctx).Model(&models.Image{}).Where("id = ?", id).Update("last_accessed_at", now).Error
}

func (r *imageRepository) UpsertVariant(ctx context.Context, v *models.ImageVariant) error {
	if v == nil {
		return fmt.Errorf("variant is nil")
	}
	return r.db.WithContext(ctx).
		Exec(`
INSERT INTO image_variants (image_id, size_name, size_px, format, path, width, height, bytes)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (image_id, size_px, format)
DO UPDATE SET
  size_name = EXCLUDED.size_name,
  path = EXCLUDED.path,
  width = EXCLUDED.width,
  height = EXCLUDED.height,
  bytes = EXCLUDED.bytes
`, v.ImageID, v.SizeName, v.SizePx, v.Format, v.Path, v.Width, v.Height, v.Bytes).Error
}

func (r *imageRepository) GetVariantsByImageID(ctx context.Context, imageID uint) ([]models.ImageVariant, error) {
	var variants []models.ImageVariant
	err := r.db.WithContext(ctx).
		Where("image_id = ?", imageID).
		Order("size_px ASC, format ASC").
		Find(&variants).Error
	return variants, err
}

func (r *imageRepository) ClaimNextQueued(ctx context.Context) (*models.Image, error) {
	if r.db.Name() == "postgres" {
		var claimed models.Image
		err := r.db.WithContext(ctx).Raw(`
WITH picked AS (
	SELECT id
	FROM images
	WHERE status = ?
	ORDER BY id
	FOR UPDATE SKIP LOCKED
	LIMIT 1
)
UPDATE images i
SET status = ?,
    processing_started_at = NOW(),
    processing_attempts = i.processing_attempts + 1,
    error = ''
FROM picked
WHERE i.id = picked.id
RETURNING i.*
`, ImageStatusQueued, ImageStatusProcessing).Scan(&claimed).Error
		if err != nil {
			return nil, err
		}
		if claimed.ID == 0 {
			return nil, gorm.ErrRecordNotFound
		}
		return &claimed, nil
	}

	// SQLite/test fallback (best-effort atomicity).
	var claimed models.Image
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("status = ?", ImageStatusQueued).Order("id ASC").First(&claimed).Error; err != nil {
			return err
		}
		res := tx.Model(&models.Image{}).
			Where("id = ? AND status = ?", claimed.ID, ImageStatusQueued).
			Updates(map[string]interface{}{
				"status":                ImageStatusProcessing,
				"processing_started_at": time.Now().UTC(),
				"processing_attempts":   gorm.Expr("processing_attempts + 1"),
				"error":                 "",
			})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return tx.First(&claimed, claimed.ID).Error
	})
	if err != nil {
		return nil, err
	}
	return &claimed, nil
}

func (r *imageRepository) MarkReady(ctx context.Context, imageID uint) error {
	return r.db.WithContext(ctx).Model(&models.Image{}).
		Where("id = ?", imageID).
		Updates(map[string]interface{}{
			"status":                ImageStatusReady,
			"error":                 "",
			"processing_started_at": nil,
		}).Error
}

func (r *imageRepository) MarkFailed(ctx context.Context, imageID uint, errMsg string) error {
	if len(errMsg) > 4000 {
		errMsg = errMsg[:4000]
	}
	return r.db.WithContext(ctx).Model(&models.Image{}).
		Where("id = ?", imageID).
		Updates(map[string]interface{}{
			"status":                ImageStatusFailed,
			"error":                 errMsg,
			"processing_started_at": nil,
		}).Error
}

func (r *imageRepository) RequeueStaleProcessing(ctx context.Context, olderThan time.Duration) (int64, error) {
	if olderThan <= 0 {
		return 0, errors.New("olderThan must be > 0")
	}
	cutoff := time.Now().UTC().Add(-olderThan)
	res := r.db.WithContext(ctx).Model(&models.Image{}).
		Where("status = ? AND processing_started_at IS NOT NULL AND processing_started_at < ?", ImageStatusProcessing, cutoff).
		Updates(map[string]interface{}{
			"status":                ImageStatusQueued,
			"processing_started_at": nil,
		})
	return res.RowsAffected, res.Error
}
