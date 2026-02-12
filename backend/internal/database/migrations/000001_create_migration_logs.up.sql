CREATE TABLE IF NOT EXISTS migration_logs (
    version BIGINT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_migration_logs_applied_at ON migration_logs (applied_at);
