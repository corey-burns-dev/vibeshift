-- Make foreign key constraints deferrable to avoid transaction ordering issues
-- This is necessary because GORM may prepare INSERT statements in an order that doesn't
-- match the FK dependency order, causing constraint violations within a transaction.

-- Drop and recreate sanctum_memberships FK constraints as deferrable
ALTER TABLE sanctum_memberships
    DROP CONSTRAINT IF EXISTS fk_sanctum_memberships_sanctum;

ALTER TABLE sanctum_memberships
    ADD CONSTRAINT fk_sanctum_memberships_sanctum
    FOREIGN KEY (sanctum_id) REFERENCES sanctums(id)
    ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE sanctum_memberships
    DROP CONSTRAINT IF EXISTS fk_sanctum_memberships_user;

ALTER TABLE sanctum_memberships
    ADD CONSTRAINT fk_sanctum_memberships_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

-- Make conversations FK constraint deferrable
ALTER TABLE conversations
    DROP CONSTRAINT IF EXISTS fk_conversations_sanctum;

ALTER TABLE conversations
    ADD CONSTRAINT fk_conversations_sanctum
    FOREIGN KEY (sanctum_id) REFERENCES sanctums(id)
    ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;

-- Fix posts FK constraint to reference correct table name (was 'sancta', should be 'sanctums')
ALTER TABLE posts
    DROP CONSTRAINT IF EXISTS fk_posts_sanctum;

ALTER TABLE posts
    ADD CONSTRAINT fk_posts_sanctum
    FOREIGN KEY (sanctum_id) REFERENCES sanctums(id)
    ON DELETE SET NULL;
