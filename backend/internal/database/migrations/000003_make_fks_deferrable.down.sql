-- Revert foreign key constraints to non-deferrable

-- Revert sanctum_memberships FK constraints
ALTER TABLE sanctum_memberships
    DROP CONSTRAINT IF EXISTS fk_sanctum_memberships_sanctum;

ALTER TABLE sanctum_memberships
    ADD CONSTRAINT fk_sanctum_memberships_sanctum
    FOREIGN KEY (sanctum_id) REFERENCES sanctums(id)
    ON DELETE CASCADE;

ALTER TABLE sanctum_memberships
    DROP CONSTRAINT IF EXISTS fk_sanctum_memberships_user;

ALTER TABLE sanctum_memberships
    ADD CONSTRAINT fk_sanctum_memberships_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE;

-- Revert conversations FK constraint
ALTER TABLE conversations
    DROP CONSTRAINT IF EXISTS fk_conversations_sanctum;

ALTER TABLE conversations
    ADD CONSTRAINT fk_conversations_sanctum
    FOREIGN KEY (sanctum_id) REFERENCES sanctums(id)
    ON DELETE SET NULL;

-- Note: Not reverting posts FK fix as the old state was broken (referenced non-existent 'sancta' table)
