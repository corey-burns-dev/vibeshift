// Package repository provides data access layer implementations for the application.
package repository

import (
	"context"
	"fmt"
	"strings"

	"sanctum/internal/cache"
	"sanctum/internal/models"

	"gorm.io/gorm"
)

// PostRepository defines the interface for post data operations
type PostRepository interface {
	Create(ctx context.Context, post *models.Post) error
	GetByID(ctx context.Context, id uint, currentUserID uint) (*models.Post, error)
	GetByUserID(ctx context.Context, userID uint, limit, offset int, currentUserID uint) ([]*models.Post, error)
	GetBySanctumID(ctx context.Context, sanctumID uint, limit, offset int, currentUserID uint, sort string) ([]*models.Post, error)
	List(ctx context.Context, limit, offset int, currentUserID uint, sort string) ([]*models.Post, error)
	Search(ctx context.Context, query string, limit, offset int, currentUserID uint) ([]*models.Post, error)
	Update(ctx context.Context, post *models.Post) error
	Delete(ctx context.Context, id uint) error
	IsLiked(ctx context.Context, userID, postID uint) (bool, error)
	GetLikedPostIDs(ctx context.Context, userID uint, postIDs []uint) ([]uint, error)
	Like(ctx context.Context, userID, postID uint) error
	Unlike(ctx context.Context, userID, postID uint) error
}

// postRepository implements PostRepository
type postRepository struct {
	db *gorm.DB
}

// NewPostRepository creates a new post repository
func NewPostRepository(db *gorm.DB) PostRepository {
	return &postRepository{db: db}
}

func (r *postRepository) Create(ctx context.Context, post *models.Post) error {
	err := r.db.WithContext(ctx).Create(post).Error
	if err == nil {
		cache.InvalidatePostsList(ctx)
	}
	return err
}

func (r *postRepository) GetByID(ctx context.Context, id uint, currentUserID uint) (*models.Post, error) {
	var post models.Post
	key := cache.PostKey(id)

	var err error
	if currentUserID == 0 {
		err = cache.Aside(ctx, key, &post, cache.PostTTL, func() error {
			return r.applyPostDetails(r.db.WithContext(ctx), 0).
				Preload("User").
				Preload("Poll").
				Preload("Poll.Options").
				First(&post, id).Error
		})
	} else {
		err = r.applyPostDetails(r.db.WithContext(ctx), currentUserID).
			Preload("User").
			Preload("Poll").
			Preload("Poll.Options").
			First(&post, id).Error
	}

	if err != nil {
		return nil, err
	}
	if err := r.enrichImageMetadata(ctx, []*models.Post{&post}); err != nil {
		return nil, err
	}

	return &post, nil
}

func (r *postRepository) GetByUserID(ctx context.Context, userID uint, limit, offset int, currentUserID uint) ([]*models.Post, error) {
	var posts []*models.Post
	err := r.applyPostDetails(r.db.WithContext(ctx), currentUserID).
		Preload("User").
		Preload("Poll").
		Preload("Poll.Options").
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&posts).Error
	if err != nil {
		return nil, err
	}
	if enrichErr := r.enrichImageMetadata(ctx, posts); enrichErr != nil {
		return nil, enrichErr
	}
	return posts, err
}

func (r *postRepository) GetBySanctumID(ctx context.Context, sanctumID uint, limit, offset int, currentUserID uint, sort string) ([]*models.Post, error) {
	var posts []*models.Post
	base := r.applyPostDetails(r.db.WithContext(ctx), currentUserID).
		Preload("User").
		Preload("Poll").
		Preload("Poll.Options").
		Where("sanctum_id = ?", sanctumID)
	err := r.applySort(base, sort).
		Limit(limit).
		Offset(offset).
		Find(&posts).Error
	if err != nil {
		return nil, err
	}
	if enrichErr := r.enrichImageMetadata(ctx, posts); enrichErr != nil {
		return nil, enrichErr
	}
	return posts, nil
}

func (r *postRepository) List(ctx context.Context, limit, offset int, currentUserID uint, sort string) ([]*models.Post, error) {
	var posts []*models.Post
	base := r.applyPostDetails(r.db.WithContext(ctx), currentUserID).
		Preload("User").
		Preload("Poll").
		Preload("Poll.Options")
	err := r.applySort(base, sort).
		Limit(limit).
		Offset(offset).
		Find(&posts).Error
	if err != nil {
		return nil, err
	}
	if enrichErr := r.enrichImageMetadata(ctx, posts); enrichErr != nil {
		return nil, enrichErr
	}
	return posts, nil
}

// applySort appends the ORDER BY (and optional WHERE) clause for the requested sort type.
// likes_count and comments_count are SELECT aliases from applyPostDetails; PostgreSQL
// allows referencing them in ORDER BY within the same query level.
func (r *postRepository) applySort(db *gorm.DB, sort string) *gorm.DB {
	switch sort {
	case "hot":
		return db.Order(gorm.Expr(
			"(likes_count + comments_count * 2.0) / POWER(EXTRACT(EPOCH FROM (NOW() - posts.created_at)) / 3600.0 + 2, 1.5) DESC",
		))
	case "top":
		return db.Order("likes_count DESC, created_at DESC")
	case "rising":
		return db.
			Where("posts.created_at > NOW() - INTERVAL '48 hours'").
			Order("(likes_count + comments_count * 2) DESC")
	case "best":
		return db.Order(gorm.Expr("(likes_count + comments_count * 1.5) DESC, created_at DESC"))
	default: // "new" and anything unrecognized
		return db.Order("created_at DESC")
	}
}

func (r *postRepository) Search(ctx context.Context, query string, limit, offset int, currentUserID uint) ([]*models.Post, error) {
	var posts []*models.Post
	like := "%" + query + "%"
	err := r.applyPostDetails(r.db.WithContext(ctx), currentUserID).
		Preload("User").
		Preload("Poll").
		Preload("Poll.Options").
		Where("title ILIKE ? OR content ILIKE ?", like, like).
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&posts).Error
	if err != nil {
		return nil, err
	}
	if enrichErr := r.enrichImageMetadata(ctx, posts); enrichErr != nil {
		return nil, enrichErr
	}
	return posts, nil
}

// applyPostDetails adds subqueries to fetch counts and liked status in a single query.
func (r *postRepository) applyPostDetails(db *gorm.DB, currentUserID uint) *gorm.DB {
	selectQuery := "posts.*, " +
		"(SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id AND comments.deleted_at IS NULL) as comments_count, " +
		"(SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id) as likes_count"

	if currentUserID != 0 {
		return db.Select(selectQuery+", EXISTS(SELECT 1 FROM likes WHERE likes.post_id = posts.id AND likes.user_id = ?) as liked", currentUserID)
	}

	return db.Select(selectQuery + ", false as liked")
}

func (r *postRepository) enrichImageMetadata(ctx context.Context, posts []*models.Post) error {
	if len(posts) == 0 {
		return nil
	}

	hashes := make([]string, 0, len(posts))
	seen := map[string]struct{}{}
	for _, p := range posts {
		h := strings.TrimSpace(p.ImageHash)
		if h == "" {
			continue
		}
		if _, exists := seen[h]; exists {
			continue
		}
		seen[h] = struct{}{}
		hashes = append(hashes, h)
	}
	if len(hashes) == 0 {
		return nil
	}

	var images []models.Image
	if err := r.db.WithContext(ctx).
		Preload("Variants").
		Where("hash IN ?", hashes).
		Find(&images).Error; err != nil {
		return err
	}

	byHash := make(map[string]*models.Image, len(images))
	for i := range images {
		byHash[images[i].Hash] = &images[i]
	}

	for _, p := range posts {
		img := byHash[p.ImageHash]
		if img == nil {
			continue
		}
		p.ImageCropMode = img.CropMode
		if len(img.Variants) == 0 {
			continue
		}
		variants := make(map[string]string, len(img.Variants))
		for _, v := range img.Variants {
			key := fmt.Sprintf("%d_%s", v.SizePx, v.Format)
			variants[key] = fmt.Sprintf("/media/i/%s/%d.%s", img.Hash, v.SizePx, v.Format)
		}
		p.ImageVariants = variants
	}
	return nil
}

func (r *postRepository) Update(ctx context.Context, post *models.Post) error {
	if err := r.db.WithContext(ctx).Save(post).Error; err != nil {
		return err
	}
	cache.Invalidate(ctx, cache.PostKey(post.ID))
	return nil
}

func (r *postRepository) Delete(ctx context.Context, id uint) error {
	if err := r.db.WithContext(ctx).Delete(&models.Post{}, id).Error; err != nil {
		return err
	}
	cache.Invalidate(ctx, cache.PostKey(id))
	cache.InvalidatePostsList(ctx)
	return nil
}

func (r *postRepository) IsLiked(ctx context.Context, userID, postID uint) (bool, error) {
	var count int64
	if err := r.db.WithContext(ctx).
		Model(&models.Like{}).
		Where("user_id = ? AND post_id = ?", userID, postID).
		Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *postRepository) GetLikedPostIDs(ctx context.Context, userID uint, postIDs []uint) ([]uint, error) {
	if len(postIDs) == 0 {
		return nil, nil
	}
	var likedPostIDs []uint
	err := r.db.WithContext(ctx).
		Model(&models.Like{}).
		Where("user_id = ? AND post_id IN ?", userID, postIDs).
		Pluck("post_id", &likedPostIDs).Error
	return likedPostIDs, err
}

func (r *postRepository) Like(ctx context.Context, userID, postID uint) error {
	// Use INSERT ... ON CONFLICT DO NOTHING to handle race conditions
	// This is atomic and prevents duplicate key errors
	result := r.db.WithContext(ctx).Exec(
		`INSERT INTO likes (user_id, post_id, created_at) 
		 VALUES (?, ?, NOW()) 
		 ON CONFLICT (user_id, post_id) DO NOTHING`,
		userID, postID,
	)
	if result.Error == nil {
		cache.Invalidate(ctx, cache.PostKey(postID))
	}
	return result.Error
}

func (r *postRepository) Unlike(ctx context.Context, userID, postID uint) error {
	// Hard delete the like record (not soft delete)
	err := r.db.WithContext(ctx).Unscoped().Where("user_id = ? AND post_id = ?", userID, postID).Delete(&models.Like{}).Error
	if err == nil {
		cache.Invalidate(ctx, cache.PostKey(postID))
	}
	return err
}
