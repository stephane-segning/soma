-- Cache of peer public keys learned via Identify or manual import.
CREATE TABLE IF NOT EXISTS peer_public_keys (
    peer_id TEXT PRIMARY KEY,
    public_key BLOB NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_peer_public_keys_updated_at ON peer_public_keys(updated_at);
