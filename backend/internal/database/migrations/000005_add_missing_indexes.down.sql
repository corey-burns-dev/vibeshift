-- Rollback migration to remove added indexes
DROP INDEX IF EXISTS idx_posts_user_id;
DROP INDEX IF EXISTS idx_posts_sanctum_id;
DROP INDEX IF EXISTS idx_comments_post_id;
DROP INDEX IF EXISTS idx_comments_user_id;
DROP INDEX IF EXISTS idx_messages_conversation_id;
DROP INDEX IF EXISTS idx_messages_sender_id;
DROP INDEX IF EXISTS idx_likes_post_id;
DROP INDEX IF EXISTS idx_sanctums_created_by_user_id;
DROP INDEX IF EXISTS idx_sanctum_requests_requested_by_user_id;
DROP INDEX IF EXISTS idx_friendships_addressee_id;
