package service

import (
	"context"

	"sanctum/internal/models"
	"sanctum/internal/repository"
)

type CommentService struct {
	commentRepo repository.CommentRepository
	postRepo    repository.PostRepository
	isAdmin     func(ctx context.Context, userID uint) (bool, error)
}

type CreateCommentInput struct {
	UserID  uint
	PostID  uint
	Content string
}

type UpdateCommentInput struct {
	UserID    uint
	CommentID uint
	Content   string
}

type DeleteCommentInput struct {
	UserID    uint
	CommentID uint
}

func NewCommentService(
	commentRepo repository.CommentRepository,
	postRepo repository.PostRepository,
	isAdmin func(ctx context.Context, userID uint) (bool, error),
) *CommentService {
	return &CommentService{
		commentRepo: commentRepo,
		postRepo:    postRepo,
		isAdmin:     isAdmin,
	}
}

func (s *CommentService) CreateComment(ctx context.Context, in CreateCommentInput) (*models.Comment, error) {
	if _, err := s.postRepo.GetByID(ctx, in.PostID, 0); err != nil {
		return nil, err
	}
	const maxCommentLen = 10000

	if in.Content == "" {
		return nil, models.NewValidationError("Content is required")
	}
	if len(in.Content) > maxCommentLen {
		return nil, models.NewValidationError("Comment too long (max 10000 characters)")
	}

	comment := &models.Comment{
		Content: in.Content,
		UserID:  in.UserID,
		PostID:  in.PostID,
	}
	if err := s.commentRepo.Create(ctx, comment); err != nil {
		return nil, err
	}

	return s.commentRepo.GetByID(ctx, comment.ID)
}

func (s *CommentService) ListComments(ctx context.Context, postID uint) ([]*models.Comment, error) {
	if _, err := s.postRepo.GetByID(ctx, postID, 0); err != nil {
		return nil, err
	}
	return s.commentRepo.ListByPost(ctx, postID)
}

func (s *CommentService) UpdateComment(ctx context.Context, in UpdateCommentInput) (*models.Comment, error) {
	comment, err := s.commentRepo.GetByID(ctx, in.CommentID)
	if err != nil {
		return nil, err
	}

	if comment.UserID != in.UserID {
		return nil, models.NewUnauthorizedError("You can only update your own comments")
	}
	if in.Content == "" {
		return nil, models.NewValidationError("Content is required")
	}

	comment.Content = in.Content
	if err := s.commentRepo.Update(ctx, comment); err != nil {
		return nil, err
	}

	return s.commentRepo.GetByID(ctx, comment.ID)
}

func (s *CommentService) DeleteComment(ctx context.Context, in DeleteCommentInput) (*models.Comment, error) {
	comment, err := s.commentRepo.GetByID(ctx, in.CommentID)
	if err != nil {
		return nil, err
	}

	if comment.UserID != in.UserID {
		if s.isAdmin == nil {
			return nil, models.NewUnauthorizedError("You can only delete your own comments")
		}
		admin, err := s.isAdmin(ctx, in.UserID)
		if err != nil {
			return nil, err
		}
		if !admin {
			return nil, models.NewUnauthorizedError("You can only delete your own comments")
		}
	}

	if err := s.commentRepo.Delete(ctx, in.CommentID); err != nil {
		return nil, err
	}

	return comment, nil
}
