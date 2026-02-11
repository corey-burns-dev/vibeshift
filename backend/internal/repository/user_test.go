package repository

import (
	"context"
	"errors"
	"regexp"
	"testing"

	"sanctum/internal/models"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func setupMockDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)

	gormDB, err := gorm.Open(postgres.New(postgres.Config{
		Conn: db,
	}), &gorm.Config{})
	require.NoError(t, err)

	return gormDB, mock
}

func TestUserRepository_GetByID(t *testing.T) {
	db, mock := setupMockDB(t)
	repo := NewUserRepository(db)
	ctx := context.Background()

	tests := []struct {
		name          string
		userID        uint
		mockBehavior  func()
		expectedUser  *models.User
		expectedError bool
	}{
		{
			name:   "Success",
			userID: 1,
			mockBehavior: func() {
				rows := sqlmock.NewRows([]string{"id", "username", "email"}).
					AddRow(1, "testuser", "test@example.com")
				mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "users" WHERE "users"."id" = $1 AND "users"."deleted_at" IS NULL ORDER BY "users"."id" LIMIT $2`)).
					WithArgs(1, 1).
					WillReturnRows(rows)
			},
			expectedUser: &models.User{ID: 1, Username: "testuser", Email: "test@example.com"},
		},
		{
			name:   "Not Found",
			userID: 99,
			mockBehavior: func() {
				mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "users" WHERE "users"."id" = $1 AND "users"."deleted_at" IS NULL ORDER BY "users"."id" LIMIT $2`)).
					WithArgs(99, 1).
					WillReturnError(gorm.ErrRecordNotFound)
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.mockBehavior()
			user, err := repo.GetByID(ctx, tt.userID)

			if tt.expectedError {
				assert.Error(t, err)
			} else if assert.NotNil(t, user) {
				assert.Equal(t, tt.expectedUser.Username, user.Username)
			}
			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}

func TestUserRepository_GetByID_DatabaseError(t *testing.T) {
	db, mock := setupMockDB(t)
	repo := NewUserRepository(db)
	ctx := context.Background()

	mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "users" WHERE "users"."id" = $1`)).
		WithArgs(1, 1).
		WillReturnError(errors.New("connection timeout"))

	user, err := repo.GetByID(ctx, 1)
	assert.Error(t, err)
	assert.Nil(t, user)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestUserRepository_GetByIDWithPosts(t *testing.T) {
	db, mock := setupMockDB(t)
	repo := NewUserRepository(db)
	ctx := context.Background()

	t.Run("Success with Preload", func(t *testing.T) {
		userID := uint(1)
		limit := 5

		// Expect user query
		userRows := sqlmock.NewRows([]string{"id", "username"}).AddRow(userID, "testuser")
		mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "users" WHERE "users"."id" = $1 AND "users"."deleted_at" IS NULL ORDER BY "users"."id" LIMIT $2`)).
			WithArgs(userID, 1).
			WillReturnRows(userRows)

		// Expect posts query (preloaded)
		postRows := sqlmock.NewRows([]string{"id", "title", "user_id"}).
			AddRow(101, "Post 1", userID).
			AddRow(102, "Post 2", userID)
		mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "posts" WHERE "posts"."user_id" = $1 AND "posts"."deleted_at" IS NULL ORDER BY created_at DESC LIMIT $2`)).
			WithArgs(userID, limit).
			WillReturnRows(postRows)

		user, err := repo.GetByIDWithPosts(ctx, userID, limit)
		assert.NoError(t, err)
		assert.NotNil(t, user)
		assert.Len(t, user.Posts, 2)
		assert.Equal(t, "Post 1", user.Posts[0].Title)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("Default Limit Enforcement", func(t *testing.T) {
		userID := uint(1)
		// limit <= 0 should default to 10
		userRows := sqlmock.NewRows([]string{"id"}).AddRow(userID)
		mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "users" WHERE "users"."id" = $1`)).
			WithArgs(userID, 1).
			WillReturnRows(userRows)

		mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "posts" WHERE "posts"."user_id" = $1`)).
			WithArgs(userID, 10). // Verified default limit
			WillReturnRows(sqlmock.NewRows([]string{"id"}))

		_, _ = repo.GetByIDWithPosts(ctx, userID, 0)
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

func TestUserRepository_GetByEmail(t *testing.T) {
	db, mock := setupMockDB(t)
	repo := NewUserRepository(db)
	ctx := context.Background()

	t.Run("Success", func(t *testing.T) {
		email := "test@example.com"
		rows := sqlmock.NewRows([]string{"id", "email"}).AddRow(1, email)
		mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "users" WHERE email = $1 AND "users"."deleted_at" IS NULL ORDER BY "users"."id" LIMIT $2`)).
			WithArgs(email, 1).
			WillReturnRows(rows)

		user, err := repo.GetByEmail(ctx, email)
		assert.NoError(t, err)
		assert.NotNil(t, user)
		assert.Equal(t, email, user.Email)
		assert.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("Not Found", func(t *testing.T) {
		email := "ghost@example.com"
		mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "users" WHERE email = $1`)).
			WithArgs(email, 1).
			WillReturnError(gorm.ErrRecordNotFound)

		user, err := repo.GetByEmail(ctx, email)
		assert.NoError(t, err) // Should return nil, nil per implementation
		assert.Nil(t, user)
		assert.NoError(t, mock.ExpectationsWereMet())
	})
}

func TestUserRepository_Create(t *testing.T) {
	db, mock := setupMockDB(t)
	repo := NewUserRepository(db)
	ctx := context.Background()

	user := &models.User{Username: "newuser", Email: "new@example.com"}

	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(`INSERT INTO "users"`)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(1))
	mock.ExpectCommit()

	err := repo.Create(ctx, user)
	assert.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}
