package notifications

import (
	"encoding/json"
	"fmt"
	"testing"

	"sanctum/internal/models"

	"github.com/stretchr/testify/require"
)

func TestGameHubHandleChat_PersistsAndBroadcasts(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)
	room := createOthelloRoom(t, db, creator.ID, opponent.ID, models.InitialOthelloBoard())
	creatorClient, opponentClient := registerRoomClients(t, hub, room.ID, creator.ID, opponent.ID)

	mutated := hub.HandleAction(creator.ID, GameAction{
		Type:   "chat",
		RoomID: room.ID,
		UserID: creator.ID,
		Payload: map[string]interface{}{
			"username": creator.Username,
			"text":     "gg",
		},
	})
	require.False(t, mutated)

	creatorAction := mustReadGameAction(t, creatorClient)
	opponentAction := mustReadGameAction(t, opponentClient)
	require.Equal(t, "chat", creatorAction.Type)
	require.Equal(t, "chat", opponentAction.Type)
	require.Equal(t, room.ID, creatorAction.RoomID)
	require.Equal(t, room.ID, opponentAction.RoomID)

	var wirePayload map[string]string
	require.NoError(t, json.Unmarshal(creatorAction.Payload, &wirePayload))
	require.Equal(t, creator.Username, wirePayload["username"])
	require.Equal(t, "gg", wirePayload["text"])

	var messages []models.GameRoomMessage
	require.NoError(t, db.Where("game_room_id = ?", room.ID).Order("id ASC").Find(&messages).Error)
	require.Len(t, messages, 1)
	require.Equal(t, room.ID, messages[0].GameRoomID)
	require.Equal(t, creator.ID, messages[0].UserID)
	require.Equal(t, creator.Username, messages[0].Username)
	require.Equal(t, "gg", messages[0].Text)
}

func TestGameHubHandleChat_TrimsPersistedHistoryToConfiguredLimit(t *testing.T) {
	db := setupGameSQLiteDB(t)
	hub := NewGameHub(db, nil)
	creator, opponent := createGameUsers(t, db)
	room := createOthelloRoom(t, db, creator.ID, opponent.ID, models.InitialOthelloBoard())

	for i := 0; i < models.MaxGameRoomMessages+5; i++ {
		hub.HandleAction(creator.ID, GameAction{
			Type:   "chat",
			RoomID: room.ID,
			UserID: creator.ID,
			Payload: map[string]interface{}{
				"username": creator.Username,
				"text":     fmt.Sprintf("message-%03d", i),
			},
		})
	}

	var messages []models.GameRoomMessage
	require.NoError(t, db.Where("game_room_id = ?", room.ID).
		Order("created_at ASC, id ASC").
		Find(&messages).Error)
	require.Len(t, messages, models.MaxGameRoomMessages)
	require.Equal(t, "message-005", messages[0].Text)
	require.Equal(t, "message-104", messages[len(messages)-1].Text)
}
