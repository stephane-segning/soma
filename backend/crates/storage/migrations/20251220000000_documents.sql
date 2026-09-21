-- Documents (Yoopta editor JSON) stored by daemon/bot for persistence and sync.
CREATE TABLE IF NOT EXISTS documents (
    space_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    content_json TEXT NOT NULL,
    published INTEGER NOT NULL DEFAULT 0,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (space_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_documents_space ON documents(space_id);
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at_ms);

