CREATE TABLE IF NOT EXISTS sanctums (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(24) NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'rejected', 'banned')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sanctum_requests (
    id BIGSERIAL PRIMARY KEY,
    requested_name VARCHAR(120) NOT NULL,
    requested_slug VARCHAR(24) NOT NULL,
    reason TEXT NOT NULL,
    requested_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
    review_notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sanctum_memberships (
    sanctum_id BIGINT NOT NULL REFERENCES sanctums(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'mod', 'member')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (sanctum_id, user_id)
);

ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS sanctum_id BIGINT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_conversations_sanctum'
    ) THEN
        ALTER TABLE conversations
            ADD CONSTRAINT fk_conversations_sanctum
            FOREIGN KEY (sanctum_id) REFERENCES sanctums(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_sanctum_id_unique
    ON conversations (sanctum_id)
    WHERE sanctum_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sanctum_requests_requested_by_status
    ON sanctum_requests (requested_by_user_id, status);

CREATE INDEX IF NOT EXISTS idx_sanctum_requests_status_created_at
    ON sanctum_requests (status, created_at);
