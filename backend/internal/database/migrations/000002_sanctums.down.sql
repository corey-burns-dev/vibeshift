DROP INDEX IF EXISTS idx_sanctum_requests_status_created_at;
DROP INDEX IF EXISTS idx_sanctum_requests_requested_by_status;
DROP INDEX IF EXISTS idx_conversations_sanctum_id_unique;

ALTER TABLE conversations
    DROP CONSTRAINT IF EXISTS fk_conversations_sanctum;

ALTER TABLE conversations
    DROP COLUMN IF EXISTS sanctum_id;

DROP TABLE IF EXISTS sanctum_memberships;
DROP TABLE IF EXISTS sanctum_requests;
DROP TABLE IF EXISTS sanctums;
