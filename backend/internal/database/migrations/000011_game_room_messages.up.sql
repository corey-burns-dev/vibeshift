-- Create game_room_messages table for persisting in-game chat
CREATE TABLE game_room_messages (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    game_room_id BIGINT NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL,
    username VARCHAR(255) NOT NULL,
    text TEXT NOT NULL
);

CREATE INDEX idx_game_room_messages_room ON game_room_messages(game_room_id, created_at);
