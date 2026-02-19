CREATE TABLE IF NOT EXISTS chatroom_bans (
    conversation_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    banned_by_user_id BIGINT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_chatroom_bans PRIMARY KEY (conversation_id, user_id),
    CONSTRAINT fk_chatroom_bans_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_chatroom_bans_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_chatroom_bans_banned_by_user FOREIGN KEY (banned_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chatroom_bans_user_id ON chatroom_bans (user_id);
CREATE INDEX IF NOT EXISTS idx_chatroom_bans_banned_by_user_id ON chatroom_bans (banned_by_user_id);
