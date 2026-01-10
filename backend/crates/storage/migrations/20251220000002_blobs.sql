-- Blob metadata (content-addressed objects) stored by the daemon for persistence and GC.
CREATE TABLE IF NOT EXISTS blobs (
    space_id TEXT NOT NULL,
    cid TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    created_at_ms INTEGER NOT NULL,
    last_seen_ms INTEGER NOT NULL,
    PRIMARY KEY (space_id, cid)
);

CREATE INDEX IF NOT EXISTS idx_blobs_space ON blobs(space_id);
CREATE INDEX IF NOT EXISTS idx_blobs_last_seen ON blobs(last_seen_ms);

-- References from documents to blobs (for listing + safe GC).
CREATE TABLE IF NOT EXISTS blob_refs (
    space_id TEXT NOT NULL,
    cid TEXT NOT NULL,
    document_id TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY (space_id, cid, document_id)
);

CREATE INDEX IF NOT EXISTS idx_blob_refs_space_doc ON blob_refs(space_id, document_id);
CREATE INDEX IF NOT EXISTS idx_blob_refs_space_cid ON blob_refs(space_id, cid);
