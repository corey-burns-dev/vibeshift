package database

import (
	"testing"

	modelspkg "sanctum/internal/models"

	"github.com/stretchr/testify/require"
)

func TestPersistentModels_IncludesGameRoomMessage(t *testing.T) {
	found := false
	for _, model := range PersistentModels() {
		if _, ok := model.(*modelspkg.GameRoomMessage); ok {
			found = true
			break
		}
	}
	require.True(t, found, "PersistentModels should include GameRoomMessage")
}
