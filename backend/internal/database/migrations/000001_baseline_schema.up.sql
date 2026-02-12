CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    avatar VARCHAR(255) NOT NULL DEFAULT '',
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT uq_users_username UNIQUE (username),
    CONSTRAINT uq_users_email UNIQUE (email)
);

CREATE TABLE sanctums (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(24) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_by_user_id BIGINT,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sanctums_slug UNIQUE (slug),
    CONSTRAINT chk_sanctums_status CHECK (status IN ('active', 'pending', 'rejected', 'banned')),
    CONSTRAINT fk_sanctums_created_by_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE sanctum_requests (
    id BIGSERIAL PRIMARY KEY,
    requested_name VARCHAR(120) NOT NULL,
    requested_slug VARCHAR(24) NOT NULL,
    reason TEXT NOT NULL,
    requested_by_user_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    reviewed_by_user_id BIGINT,
    review_notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_sanctum_requests_status CHECK (status IN ('pending', 'approved', 'rejected')),
    CONSTRAINT fk_sanctum_requests_requested_by_user FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_sanctum_requests_reviewed_by_user FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE sanctum_memberships (
    sanctum_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_sanctum_memberships PRIMARY KEY (sanctum_id, user_id),
    CONSTRAINT chk_sanctum_memberships_role CHECK (role IN ('owner', 'mod', 'member')),
    CONSTRAINT fk_sanctum_memberships_sanctum FOREIGN KEY (sanctum_id) REFERENCES sanctums(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    CONSTRAINT fk_sanctum_memberships_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE posts (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    image_url VARCHAR(255) NOT NULL DEFAULT '',
    user_id BIGINT NOT NULL,
    sanctum_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_posts_sanctum FOREIGN KEY (sanctum_id) REFERENCES sanctums(id) ON DELETE SET NULL
);

CREATE TABLE comments (
    id BIGSERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    user_id BIGINT NOT NULL,
    post_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_comments_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE TABLE likes (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    post_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_likes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_likes_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    CONSTRAINT idx_user_post UNIQUE (user_id, post_id)
);

CREATE TABLE conversations (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL DEFAULT '',
    is_group BOOLEAN NOT NULL DEFAULT FALSE,
    avatar VARCHAR(255) NOT NULL DEFAULT '',
    created_by BIGINT NOT NULL DEFAULT 0,
    sanctum_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fk_conversations_sanctum FOREIGN KEY (sanctum_id) REFERENCES sanctums(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE conversation_participants (
    conversation_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unread_count INT NOT NULL DEFAULT 0,
    CONSTRAINT pk_conversation_participants PRIMARY KEY (conversation_id, user_id),
    CONSTRAINT fk_conversation_participants_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_conversation_participants_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE messages (
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL,
    sender_id BIGINT NOT NULL,
    content TEXT NOT NULL,
    message_type VARCHAR(50) NOT NULL DEFAULT 'text',
    metadata JSONB,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE friendships (
    id BIGSERIAL PRIMARY KEY,
    requester_id BIGINT NOT NULL,
    addressee_id BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_friendships_requester FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_friendships_addressee FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE game_rooms (
    id BIGSERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    creator_id BIGINT NOT NULL,
    opponent_id BIGINT,
    winner_id BIGINT,
    is_draw BOOLEAN NOT NULL DEFAULT FALSE,
    configuration JSONB,
    current_state JSONB,
    next_turn_id BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fk_game_rooms_creator FOREIGN KEY (creator_id) REFERENCES users(id),
    CONSTRAINT fk_game_rooms_opponent FOREIGN KEY (opponent_id) REFERENCES users(id),
    CONSTRAINT fk_game_rooms_winner FOREIGN KEY (winner_id) REFERENCES users(id)
);

CREATE TABLE game_moves (
    id BIGSERIAL PRIMARY KEY,
    game_room_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    move_data JSONB,
    move_number INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_game_moves_game_room FOREIGN KEY (game_room_id) REFERENCES game_rooms(id) ON DELETE CASCADE,
    CONSTRAINT fk_game_moves_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE game_stats (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    game_type VARCHAR(50) NOT NULL,
    wins INT NOT NULL DEFAULT 0,
    losses INT NOT NULL DEFAULT 0,
    draws INT NOT NULL DEFAULT 0,
    total_games INT NOT NULL DEFAULT 0,
    points INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_game_stats_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_users_deleted_at ON users (deleted_at);
CREATE INDEX idx_sanctums_created_by_user_id ON sanctums (created_by_user_id);
CREATE INDEX idx_sanctum_requests_requested_by_user_id ON sanctum_requests (requested_by_user_id);
CREATE INDEX idx_sanctum_requests_status ON sanctum_requests (status);
CREATE INDEX idx_sanctum_requests_requested_by_status ON sanctum_requests (requested_by_user_id, status);
CREATE INDEX idx_sanctum_requests_status_created_at ON sanctum_requests (status, created_at);
CREATE INDEX idx_posts_user_id ON posts (user_id);
CREATE INDEX idx_posts_sanctum_id ON posts (sanctum_id);
CREATE INDEX idx_posts_deleted_at ON posts (deleted_at);
CREATE INDEX idx_comments_post_id ON comments (post_id);
CREATE INDEX idx_comments_user_id ON comments (user_id);
CREATE INDEX idx_comments_deleted_at ON comments (deleted_at);
CREATE INDEX idx_likes_post_id ON likes (post_id);
CREATE UNIQUE INDEX idx_conversations_sanctum_id_unique ON conversations (sanctum_id) WHERE sanctum_id IS NOT NULL;
CREATE INDEX idx_conversations_deleted_at ON conversations (deleted_at);
CREATE INDEX idx_conversation_participants_user_id ON conversation_participants (user_id);
CREATE INDEX idx_messages_conversation_id ON messages (conversation_id);
CREATE INDEX idx_messages_sender_id ON messages (sender_id);
CREATE INDEX idx_messages_deleted_at ON messages (deleted_at);
CREATE UNIQUE INDEX idx_friendship_users ON friendships (requester_id, addressee_id);
CREATE INDEX idx_friendships_addressee_id ON friendships (addressee_id);
CREATE INDEX idx_friendships_status ON friendships (status);
CREATE INDEX idx_game_rooms_deleted_at ON game_rooms (deleted_at);
CREATE INDEX idx_game_moves_game_room_id ON game_moves (game_room_id);
CREATE UNIQUE INDEX idx_user_game ON game_stats (user_id, game_type);
