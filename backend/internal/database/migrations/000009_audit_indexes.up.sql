-- 000009_audit_indexes.up.sql
-- Pre-production audit: add missing indexes and constraints

-- H1: Trigram index for post search (replaces ILIKE %...% sequential scan)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_posts_title_trgm ON posts USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_posts_content_trgm ON posts USING gin (content gin_trgm_ops);

-- M6: Compound index for chat message queries ordered by created_at
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON messages (conversation_id, created_at DESC);

-- M7: Unique constraint on user_blocks to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_blocks_pair
    ON user_blocks (blocker_id, blocked_id);

-- L4: Index on moderation_reports.reporter_id for admin queries
CREATE INDEX IF NOT EXISTS idx_moderation_reports_reporter
    ON moderation_reports (reporter_id);
