-- Migration to add missing indexes on foreign key columns for performance
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_sanctum_id ON posts(sanctum_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id);
CREATE INDEX IF NOT EXISTS idx_sanctums_created_by_user_id ON sanctums(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_sanctum_requests_requested_by_user_id ON sanctum_requests(requested_by_user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee_id ON friendships(addressee_id);
CREATE INDEX IF NOT EXISTS idx_streams_user_id ON streams(user_id);
CREATE INDEX IF NOT EXISTS idx_stream_messages_stream_id ON stream_messages(stream_id);
CREATE INDEX IF NOT EXISTS idx_stream_messages_user_id ON stream_messages(user_id);
