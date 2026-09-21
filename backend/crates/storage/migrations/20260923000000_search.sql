-- Search support for pages/documents/spaces (see `soma_storage::search`
-- for the full design).
--
-- `documents.plain_text`: a flattened, user-visible-only rendering of
-- each document's Tiptap/ProseMirror `content_json`, refreshed at write
-- time by `soma_storage::documents::extract_plain_text` (called from
-- `SqlDocumentRepository::upsert_document`). Search matches against this
-- column instead of raw `content_json` so a query doesn't match Tiptap
-- node type names, attribute keys, or a link's `href` — none of which
-- the user actually sees. Not SQLite FTS5: this migrations directory
-- also runs against Postgres for `somad bot` (see AGENTS.md's "Storage"
-- section), and FTS5 is a SQLite-only virtual-table mechanism Postgres
-- has no equivalent for at all.
--
-- Existing rows backfill lazily: `plain_text` starts empty and is
-- populated the next time each document is saved. No backfill migration
-- — the extraction logic lives in Rust, not SQL, and this is a pre-prod
-- app where breaking changes are fine (AGENTS.md).
ALTER TABLE documents ADD COLUMN plain_text TEXT NOT NULL DEFAULT '';

-- Every search query joins `space_memberships` on `subject_peer_id` to
-- scope results to the caller's own spaces (the membership boundary IS
-- the authorization check — see `soma_daemon::DaemonHandle::search`).
-- The table's existing primary key `(space_id, subject_peer_id)` only
-- accelerates a lookup that already knows `space_id`; this index covers
-- the complementary direction search needs: "which spaces is this
-- subject a member of at all".
CREATE INDEX IF NOT EXISTS idx_memberships_subject ON space_memberships(subject_peer_id);
