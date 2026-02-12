-- Drop old GORM-pluralized table if it exists
DROP TABLE IF EXISTS sancta CASCADE;

-- Tables are now created in 000000_core.up.sql with correct FKs

-- Ensure unique index for sanctum chat rooms
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_sanctum_id_unique
    ON conversations (sanctum_id)
    WHERE sanctum_id IS NOT NULL;

-- Request-specific indexes
CREATE INDEX IF NOT EXISTS idx_sanctum_requests_requested_by_status
    ON sanctum_requests (requested_by_user_id, status);

CREATE INDEX IF NOT EXISTS idx_sanctum_requests_status_created_at
    ON sanctum_requests (status, created_at);
