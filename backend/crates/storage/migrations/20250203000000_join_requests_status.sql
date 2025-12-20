-- Add status/target/attempt tracking to join_requests for better introspection.
-- SQLite does not support adding multiple columns in a single ALTER TABLE.
ALTER TABLE join_requests ADD COLUMN target_peer_id TEXT;
ALTER TABLE join_requests ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE join_requests ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE join_requests ADD COLUMN next_attempt_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE join_requests ADD COLUMN last_error TEXT;
