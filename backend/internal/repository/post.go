// Package repository provides data access layer implementations for the application.
package repository

import (
	"context"

	"sanctum/internal/cache"
	"sanctum/internal/models"

	"gorm.io/gorm"
)

// PostRepository defines the interface for post data operations
type PostRepository interface {
	Create(ctx context.Context, post *models.Post) error
	GetByID(ctx context.Context, id uint, currentUserID uint) (*models.Post, error)
	GetByUserID(ctx context.Context, userID uint, limit, offset int, currentUserID uint) ([]*models.Post, error)
	GetBySanctumID(ctx context.Context, sanctumID uint, limit, offset int, currentUserID uint) ([]*models.Post, error)
	List(ctx context.Context, limit, offset int, currentUserID uint) ([]*models.Post, error)
	Search(ctx context.Context, query string, limit, offset int, currentUserID uint) ([]*models.Post, error)
	Update(ctx context.Context, post *models.Post) error
	Delete(ctx context.Context, id uint) error
	IsLiked(ctx context.Context, userID, postID uint) (bool, error)
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
	return r.db.WithContext(ctx).Create(post).Error
}

func (r *postRepository) GetByID(ctx context.Context, id uint, currentUserID uint) (*models.Post, error) {
	var post models.Post
	key := cache.PostKey(id)

	err := cache.Aside(ctx, key, &post, cache.PostTTL, func() error {
		return r.applyPostDetails(r.db.WithContext(ctx), 0).Preload("User").First(&post, id).Error
	})

	if err != nil {
		return nil, err
	}

	// Fetch liked status separately for the current user
	if currentUserID != 0 {
		var count int64
		r.db.WithContext(ctx).Model(&models.Like{}).Where("post_id = ? AND user_id = ?", post.ID, currentUserID).Count(&count)
		post.Liked = count > 0
	}

	return &post, nil
}

func (r *postRepository) GetByUserID(ctx context.Context, userID uint, limit, offset int, currentUserID uint) ([]*models.Post, error) {
	var posts []*models.Post
	err := r.applyPostDetails(r.db.WithContext(ctx), currentUserID).
		Preload("User").
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&posts).Error
	return posts, err
}

func (r *postRepository) GetBySanctumID(ctx context.Context, sanctumID uint, limit, offset int, currentUserID uint) ([]*models.Post, error) {
	var posts []*models.Post
	err := r.applyPostDetails(r.db.WithContext(ctx), currentUserID).
		Preload("User").
		Where("sanctum_id = ?", sanctumID).
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&posts).Error
	return posts, err
}

func (r *postRepository) List(ctx context.Context, limit, offset int, currentUserID uint) ([]*models.Post, error) {
	var posts []*models.Post
	err := r.applyPostDetails(r.db.WithContext(ctx), currentUserID).
		Preload("User").
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&posts).Error
	return posts, err
}

func (r *postRepository) Search(ctx context.Context, query string, limit, offset int, currentUserID uint) ([]*models.Post, error) {
	var posts []*models.Post
	like := "%" + query + "%"
	err := r.applyPostDetails(r.db.WithContext(ctx), currentUserID).
		Preload("User").
		Where("title ILIKE ? OR content ILIKE ?", like, like).
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&posts).Error
	return posts, err
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

// populatePostDetails fetches counts for comments and likes, and checks if the post is liked by the current user.
func (r *postRepository) populatePostDetails(ctx context.Context, p *models.Post, currentUserID uint) {
	// 1. Get comments count
	var commentsCount int64
	r.db.WithContext(ctx).Model(&models.Comment{}).Where("post_id = ?", p.ID).Count(&commentsCount)
	p.CommentsCount = int(commentsCount)

	// 2. Get likes count
	var likesCount int64
	r.db.WithContext(ctx).Model(&models.Like{}).Where("post_id = ?", p.ID).Count(&likesCount)
	p.LikesCount = int(likesCount)

	// 3. Check if the current user liked the post
	if currentUserID != 0 {
		var like models.Like
		err := r.db.WithContext(ctx).Where("post_id = ? AND user_id = ?", p.ID, currentUserID).First(&like).Error
		p.Liked = err == nil
	} else {
		p.Liked = false
	}
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
