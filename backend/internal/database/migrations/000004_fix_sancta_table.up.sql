-- Fix the sancta table issue
-- The old 'sancta' table (incorrect Latin pluralization) should have been dropped
-- but was recreated by GORM AutoMigrate. This migration fixes all references.

-- Drop FK constraint on posts that references 'sancta'
ALTER TABLE posts
    DROP CONSTRAINT IF EXISTS fk_posts_sanctum;

-- Drop the old sancta table
DROP TABLE IF EXISTS sancta CASCADE;

-- Recreate the posts FK constraint to reference the correct 'sanctums' table
ALTER TABLE posts
    ADD CONSTRAINT fk_posts_sanctum
    FOREIGN KEY (sanctum_id) REFERENCES sanctums(id)
    ON DELETE SET NULL;
