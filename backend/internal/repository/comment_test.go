package repository

import (
	"context"
	"regexp"
	"testing"

	"sanctum/internal/models"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
)

func TestCommentRepository_Create(t *testing.T) {
	db, mock := setupMockDB(t)
	repo := NewCommentRepository(db)
	ctx := context.Background()

	comment := &models.Comment{Content: "Nice post!", PostID: 1, UserID: 1}

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(`INSERT INTO "comments"`)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(1))
	mock.ExpectCommit()

	err := repo.Create(ctx, comment)
	assert.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestCommentRepository_ListByPost(t *testing.T) {
	db, mock := setupMockDB(t)
	repo := NewCommentRepository(db)
	ctx := context.Background()

	mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "comments" WHERE post_id = $1 AND "comments"."deleted_at" IS NULL ORDER BY created_at desc`)).
		WithArgs(1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "content", "user_id"}).
			AddRow(1, "Comment 1", 101).
			AddRow(2, "Comment 2", 102))

	// Preload User for each comment
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "users" WHERE "users"."id" IN ($1,$2) AND "users"."deleted_at" IS NULL`)).
		WithArgs(101, 102).
		WillReturnRows(sqlmock.NewRows([]string{"id", "username"}).
			AddRow(101, "user101").
			AddRow(102, "user102"))

	comments, err := repo.ListByPost(ctx, 1)
	assert.NoError(t, err)
	assert.Len(t, comments, 2)
	assert.Equal(t, "Comment 1", comments[0].Content)
	assert.NoError(t, mock.ExpectationsWereMet())
}
