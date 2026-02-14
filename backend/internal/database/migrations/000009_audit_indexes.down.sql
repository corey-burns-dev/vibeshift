-- 000009_audit_indexes.down.sql
-- Reverse pre-production audit indexes

DROP INDEX IF EXISTS idx_moderation_reports_reporter;
DROP INDEX IF EXISTS uq_user_blocks_pair;
DROP INDEX IF EXISTS idx_messages_conversation_created;
DROP INDEX IF EXISTS idx_posts_content_trgm;
DROP INDEX IF EXISTS idx_posts_title_trgm;
-- Note: pg_trgm extension is left in place as other features may depend on it.
