-- Note: Cannot truly revert this migration as the old state was broken
-- This migration fixes a bug where the FK constraint pointed to the wrong table

-- The best we can do is ensure the posts FK constraint exists
ALTER TABLE posts
    DROP CONSTRAINT IF EXISTS fk_posts_sanctum;

ALTER TABLE posts
    ADD CONSTRAINT fk_posts_sanctum
    FOREIGN KEY (sanctum_id) REFERENCES sanctums(id)
    ON DELETE SET NULL;
