package repository

import (
	"context"
	"regexp"
	"testing"

	"sanctum/internal/models"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
)

func TestFriendRepository_GetPendingRequests(t *testing.T) {
	db, mock := setupMockDB(t)
	repo := NewFriendRepository(db)
	ctx := context.Background()

	tests := []struct {
		name         string
		userID       uint
		mockBehavior func()
		expectedLen  int
	}{
		{
			name:   "Found Pending Requests",
			userID: 1,
			mockBehavior: func() {
				mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "friendships" WHERE addressee_id = $1 AND status = $2`)).
					WithArgs(1, models.FriendshipStatusPending).
					WillReturnRows(sqlmock.NewRows([]string{"id", "requester_id", "addressee_id"}).AddRow(1, 2, 1))

				// Preload Addressee (GORM preloads alphabetically)
				mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "users" WHERE "users"."id" = $1 AND "users"."deleted_at" IS NULL`)).
					WithArgs(1).
					WillReturnRows(sqlmock.NewRows([]string{"id", "username"}).AddRow(1, "user1"))

				// Preload Requester
				mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "users" WHERE "users"."id" = $1 AND "users"."deleted_at" IS NULL`)).
					WithArgs(2).
					WillReturnRows(sqlmock.NewRows([]string{"id", "username"}).AddRow(2, "user2"))
			},
			expectedLen: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.mockBehavior()
			reqs, err := repo.GetPendingRequests(ctx, tt.userID)
			assert.NoError(t, err)
			assert.Len(t, reqs, tt.expectedLen)
			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}

func TestFriendRepository_UpdateStatus(t *testing.T) {
	db, mock := setupMockDB(t)
	repo := NewFriendRepository(db)
	ctx := context.Background()

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta(`UPDATE "friendships" SET "status"=$1,"updated_at"=$2 WHERE id = $3`)).
		WithArgs(models.FriendshipStatusAccepted, sqlmock.AnyArg(), 1).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	err := repo.UpdateStatus(ctx, 1, models.FriendshipStatusAccepted)
	assert.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}
