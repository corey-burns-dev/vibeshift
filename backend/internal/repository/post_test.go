package repository

import (
	"context"
	"regexp"
	"testing"

	"sanctum/internal/models"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
)

func TestPostRepository_Create(t *testing.T) {
	db, mock := setupMockDB(t)
	repo := NewPostRepository(db)
	ctx := context.Background()

	post := &models.Post{Title: "Test Post", Content: "Content"}

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(`INSERT INTO "posts"`)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(1))
	mock.ExpectCommit()

	err := repo.Create(ctx, post)
	assert.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestPostRepository_GetByID(t *testing.T) {
	db, mock := setupMockDB(t)
	repo := NewPostRepository(db)
	ctx := context.Background()

	tests := []struct {
		name          string
		postID        uint
		currentUserID uint
		mockBehavior  func()
		expectedTitle string
		expectedError bool
	}{
		{
			name:          "Success with Details",
			postID:        1,
			currentUserID: 2,
			mockBehavior: func() {
				// main query
				mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "posts" WHERE "posts"."id" = $1 AND "posts"."deleted_at" IS NULL ORDER BY "posts"."id" LIMIT $2`)).
					WithArgs(1, 1).
					WillReturnRows(sqlmock.NewRows([]string{"id", "title", "user_id"}).AddRow(1, "Post 1", 10))

				// preload user - GORM preloads after main query
				mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "users" WHERE "users"."id" = $1 AND "users"."deleted_at" IS NULL`)).
					WithArgs(10).
					WillReturnRows(sqlmock.NewRows([]string{"id", "username"}).AddRow(10, "user10"))

				// populatePostDetails - Comments count
				mock.ExpectQuery(regexp.QuoteMeta(`SELECT count(*) FROM "comments" WHERE post_id = $1 AND "comments"."deleted_at" IS NULL`)).
					WithArgs(1).
					WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(5))

				// populatePostDetails - Likes count
				mock.ExpectQuery(regexp.QuoteMeta(`SELECT count(*) FROM "likes" WHERE post_id = $1`)).
					WithArgs(1).
					WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(10))

				// populatePostDetails - Is liked by user
				mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "likes" WHERE post_id = $1 AND user_id = $2 ORDER BY "likes"."id" LIMIT $3`)).
					WithArgs(1, 2, 1).
					WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(1))
			},
			expectedTitle: "Post 1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.mockBehavior()
			post, err := repo.GetByID(ctx, tt.postID, tt.currentUserID)

			if tt.expectedError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expectedTitle, post.Title)
				assert.Equal(t, 5, post.CommentsCount)
				assert.Equal(t, 10, post.LikesCount)
				assert.True(t, post.Liked)
			}
			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}
