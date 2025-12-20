-- Pending join requests for manual approval.
CREATE TABLE IF NOT EXISTS join_requests (
    request_id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL,
    subject_peer_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    device_name TEXT NOT NULL,
    requested_role INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    payload BLOB
);

CREATE INDEX IF NOT EXISTS idx_join_requests_space ON join_requests(space_id);
CREATE INDEX IF NOT EXISTS idx_join_requests_subject ON join_requests(subject_peer_id);
