-- Spaces and membership domain (SQLite-focused for daemon).

CREATE TABLE IF NOT EXISTS spaces (
    space_id TEXT PRIMARY KEY,
    display_name TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS space_memberships (
    space_id TEXT NOT NULL,
    subject_peer_id TEXT NOT NULL,
    role TEXT NOT NULL,
    issuer_peer_id TEXT NOT NULL,
    issued_at INTEGER NOT NULL,
    expires_at INTEGER,
    capability BLOB,
    PRIMARY KEY (space_id, subject_peer_id)
);

CREATE TABLE IF NOT EXISTS join_decisions (
    decision_id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL,
    subject_peer_id TEXT NOT NULL,
    decision INTEGER NOT NULL,
    reason TEXT,
    created_at INTEGER NOT NULL,
    capability BLOB
);

CREATE TABLE IF NOT EXISTS issuer_capabilities (
    space_id TEXT NOT NULL,
    issuer_peer_id TEXT NOT NULL,
    delegate_peer_id TEXT NOT NULL,
    issued_at INTEGER NOT NULL,
    expires_at INTEGER,
    capability BLOB,
    PRIMARY KEY (space_id, delegate_peer_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_space ON space_memberships(space_id);
CREATE INDEX IF NOT EXISTS idx_decisions_space ON join_decisions(space_id);
CREATE INDEX IF NOT EXISTS idx_issuer_caps_space ON issuer_capabilities(space_id);
