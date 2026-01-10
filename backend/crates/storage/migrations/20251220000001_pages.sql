-- Pages (navigation metadata) stored by daemon/bot for persistence.
CREATE TABLE IF NOT EXISTS pages (
    space_id TEXT NOT NULL,
    page_id TEXT NOT NULL,
    title TEXT NOT NULL,
    parent_page_ids_json TEXT NOT NULL DEFAULT '[]',
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (space_id, page_id)
);

CREATE INDEX IF NOT EXISTS idx_pages_space ON pages(space_id);
CREATE INDEX IF NOT EXISTS idx_pages_updated_at ON pages(updated_at_ms);
