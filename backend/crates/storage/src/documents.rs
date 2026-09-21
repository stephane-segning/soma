use async_trait::async_trait;
use soma_core::{Error, SomaResult};
use sqlx::Row;
use sqlx_utils::types::Pool;

/// Stored document (Tiptap/ProseMirror JSON).
#[derive(Debug, Clone)]
pub struct Document {
    pub space_id: String,
    pub document_id: String,
    pub content_json: String,
    pub published: bool,
    pub updated_at_ms: i64,
    /// Peer id that authored this row's current version. See
    /// `migrations/20260924000000_documents_origin_peer_id.sql` for why
    /// this exists (the LWW replication tie-breaker) and
    /// `DocumentRepository::upsert_document_if_newer` for how it's used.
    pub origin_peer_id: String,
}

/// One row's replication metadata, without content.
///
/// Sized to be cheap to list in bulk for a p2p sync handshake: a peer
/// diffs its own [`list_document_digests`](DocumentRepository::list_document_digests)
/// output against a remote peer's to find which `document_id`s actually
/// differ, without ever transferring `content_json`/`plain_text` for
/// documents that already match.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentDigest {
    pub document_id: String,
    pub updated_at_ms: i64,
    pub origin_peer_id: String,
    pub published: bool,
}

#[async_trait]
pub trait DocumentRepository: Send + Sync {
    async fn upsert_document(&self, document: &Document) -> SomaResult<()>;
    async fn get_document(&self, space_id: &str, document_id: &str)
    -> SomaResult<Option<Document>>;
    async fn delete_documents_for_space(&self, space_id: &str) -> SomaResult<u64>;

    /// Digests for every document in `space_id`, ordered by `document_id`.
    async fn list_document_digests(&self, space_id: &str) -> SomaResult<Vec<DocumentDigest>>;

    /// Last-writer-wins (LWW) upsert for replicated writes. Applies
    /// `document` only if it is strictly newer than whatever is already
    /// stored for `(space_id, document_id)`, comparing
    /// `(updated_at_ms, origin_peer_id)` lexicographically — see
    /// `migrations/20260924000000_documents_origin_peer_id.sql` for why
    /// `origin_peer_id` is the second key and which direction it's
    /// biased on an exact tie.
    ///
    /// Returns `Ok(true)` if the row was written (a first-time insert,
    /// or an update that won the comparison), `Ok(false)` if the
    /// incoming version lost and storage was left completely untouched
    /// — including `plain_text`, which is only ever re-derived when a
    /// write actually lands.
    async fn upsert_document_if_newer(&self, document: &Document) -> SomaResult<bool>;
}

#[derive(Clone, Debug)]
pub struct SqlDocumentRepository {
    pool: Pool,
}

impl SqlDocumentRepository {
    pub fn new(pool: Pool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl DocumentRepository for SqlDocumentRepository {
    async fn upsert_document(&self, document: &Document) -> SomaResult<()> {
        // Re-derived on every write rather than cached anywhere upstream:
        // `content_json` is the single source of truth, and every write
        // path (upsert/draft/sync — see `desktop-api::documents`'s module
        // doc: they all funnel through this one method) gets a
        // consistent, always-fresh `plain_text` for free. See
        // `crate::search`'s module doc for why search matches against
        // this column instead of `content_json` directly.
        let plain_text = extract_plain_text(&document.content_json);

        sqlx::query(
            r#"
            INSERT INTO documents (space_id, document_id, content_json, published, updated_at_ms, plain_text, origin_peer_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT(space_id, document_id)
            DO UPDATE SET
                content_json = excluded.content_json,
                published = excluded.published,
                updated_at_ms = excluded.updated_at_ms,
                plain_text = excluded.plain_text,
                origin_peer_id = excluded.origin_peer_id
            "#,
        )
        .bind(&document.space_id)
        .bind(&document.document_id)
        .bind(&document.content_json)
        .bind(if document.published { 1_i64 } else { 0_i64 })
        .bind(document.updated_at_ms)
        .bind(&plain_text)
        .bind(&document.origin_peer_id)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(())
    }

    async fn get_document(
        &self,
        space_id: &str,
        document_id: &str,
    ) -> SomaResult<Option<Document>> {
        let row = sqlx::query(
            r#"
            SELECT space_id, document_id, content_json, published, updated_at_ms, origin_peer_id
            FROM documents
            WHERE space_id = $1 AND document_id = $2
            "#,
        )
        .bind(space_id)
        .bind(document_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(row.map(map_document_row))
    }

    async fn delete_documents_for_space(&self, space_id: &str) -> SomaResult<u64> {
        let res = sqlx::query(
            r#"
            DELETE FROM documents
            WHERE space_id = $1
            "#,
        )
        .bind(space_id)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(res.rows_affected())
    }

    async fn list_document_digests(&self, space_id: &str) -> SomaResult<Vec<DocumentDigest>> {
        let rows = sqlx::query(
            r#"
            SELECT document_id, updated_at_ms, origin_peer_id, published
            FROM documents
            WHERE space_id = $1
            ORDER BY document_id ASC
            "#,
        )
        .bind(space_id)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(rows.into_iter().map(map_digest_row).collect())
    }

    async fn upsert_document_if_newer(&self, document: &Document) -> SomaResult<bool> {
        // Same `content_json` -> `plain_text` derivation as
        // `upsert_document` above — computed unconditionally because
        // whether this write actually lands isn't known until the single
        // statement below evaluates its `WHERE`.
        let plain_text = extract_plain_text(&document.content_json);

        // One statement, not read-then-write: `INSERT ... ON CONFLICT DO
        // UPDATE ... WHERE` evaluates the tie-break against the row's
        // CURRENT, database-visible value atomically with the write, so
        // two callers racing the same `(space_id, document_id)` concurrently
        // can't both read stale state and both "win" — the database's own
        // conflict resolution serializes them.
        //
        // Portability: `ON CONFLICT ... DO UPDATE ... WHERE <condition>`
        // is valid on both backends this migrations directory runs
        // against. SQLite's UPSERT clause (3.24.0+) and PostgreSQL's
        // `INSERT ... ON CONFLICT DO UPDATE` both support a `WHERE` on
        // the `DO UPDATE` action that, when false for a given row,
        // silently skips the update for that row (no error, no partial
        // write) instead of falling through to some other behavior —
        // this is the exact same pattern
        // `space_memberships.rs::upsert_membership` already relies on
        // elsewhere in this crate.
        //
        // Tie-break: `(updated_at_ms, origin_peer_id)` compared
        // lexicographically as a tuple — strictly greater timestamp
        // always wins; on an exact timestamp tie, the greater
        // `origin_peer_id` (plain byte-wise TEXT comparison) wins. See
        // `migrations/20260924000000_documents_origin_peer_id.sql` for
        // why that column is the tie-breaker and which direction it's
        // biased.
        let result = sqlx::query(
            r#"
            INSERT INTO documents (space_id, document_id, content_json, published, updated_at_ms, plain_text, origin_peer_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT(space_id, document_id)
            DO UPDATE SET
                content_json = excluded.content_json,
                published = excluded.published,
                updated_at_ms = excluded.updated_at_ms,
                plain_text = excluded.plain_text,
                origin_peer_id = excluded.origin_peer_id
            WHERE
                excluded.updated_at_ms > documents.updated_at_ms
                OR (
                    excluded.updated_at_ms = documents.updated_at_ms
                    AND excluded.origin_peer_id > documents.origin_peer_id
                )
            "#,
        )
        .bind(&document.space_id)
        .bind(&document.document_id)
        .bind(&document.content_json)
        .bind(if document.published { 1_i64 } else { 0_i64 })
        .bind(document.updated_at_ms)
        .bind(&plain_text)
        .bind(&document.origin_peer_id)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(result.rows_affected() > 0)
    }
}

fn map_document_row(row: sqlx::any::AnyRow) -> Document {
    let published: i64 = row.get("published");
    Document {
        space_id: row.get("space_id"),
        document_id: row.get("document_id"),
        content_json: row.get("content_json"),
        published: published != 0,
        updated_at_ms: row.get("updated_at_ms"),
        origin_peer_id: row.get("origin_peer_id"),
    }
}

fn map_digest_row(row: sqlx::any::AnyRow) -> DocumentDigest {
    let published: i64 = row.get("published");
    DocumentDigest {
        document_id: row.get("document_id"),
        updated_at_ms: row.get("updated_at_ms"),
        origin_peer_id: row.get("origin_peer_id"),
        published: published != 0,
    }
}

/// Flatten Tiptap/ProseMirror document JSON into plain, user-visible
/// text for search indexing (see `crate::search`'s module doc for the
/// full rationale).
///
/// Tiptap represents rich text as a tree of nodes; each leaf node has a
/// `"type": "text"` and a `"text"` field carrying the actual string,
/// alongside structural/style metadata (`"attrs"`, `"marks"`) a naive
/// substring search would also match against — a `link` mark's `href`,
/// an `image` node's `src`, a heading's `level` attribute. This walks
/// the tree and collects only `"text"` field values, explicitly skipping
/// `"attrs"` and `"marks"` subtrees entirely, so the indexed text is
/// exactly what an editor user would see, not the document's structure.
/// Node type names themselves (`"paragraph"`, `"bulletList"`, ...) are
/// never collected either, since they never live under a `"text"` key.
///
/// Returns an empty string for content that doesn't parse as JSON —
/// fails closed: an indexing bug should make a document quietly
/// unsearchable, not searchable by every query (`WHERE LOWER(plain_text)
/// LIKE '%...%'` can never match a non-empty needle against an empty
/// haystack).
fn extract_plain_text(content_json: &str) -> String {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(content_json) else {
        return String::new();
    };
    let mut out = String::new();
    collect_text(&value, &mut out);
    out.trim().to_string()
}

fn collect_text(value: &serde_json::Value, out: &mut String) {
    match value {
        serde_json::Value::Object(map) => {
            if let Some(serde_json::Value::String(text)) = map.get("text")
                && !text.is_empty()
            {
                if !out.is_empty() && !out.ends_with(char::is_whitespace) {
                    out.push(' ');
                }
                out.push_str(text);
            }
            for (key, val) in map {
                // "text" was already handled above; "attrs"/"marks" hold
                // structural/style metadata, never user-visible prose —
                // see this function's doc comment.
                if key == "attrs" || key == "marks" || key == "text" {
                    continue;
                }
                collect_text(val, out);
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                collect_text(item, out);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod plain_text_tests {
    use super::extract_plain_text;

    #[test]
    fn collects_text_from_nested_paragraphs() {
        let json = r#"{
            "type": "doc",
            "content": [
                { "type": "paragraph", "content": [{ "type": "text", "text": "Hello" }] },
                { "type": "paragraph", "content": [{ "type": "text", "text": "world" }] }
            ]
        }"#;
        assert_eq!(extract_plain_text(json), "Hello world");
    }

    #[test]
    fn recurses_through_blockquotes_and_lists() {
        let json = r#"{
            "type": "doc",
            "content": [{
                "type": "bulletList",
                "content": [
                    { "type": "listItem", "content": [
                        { "type": "paragraph", "content": [{ "type": "text", "text": "first" }] }
                    ]},
                    { "type": "listItem", "content": [
                        { "type": "paragraph", "content": [{ "type": "text", "text": "second" }] }
                    ]}
                ]
            }]
        }"#;
        assert_eq!(extract_plain_text(json), "first second");
    }

    /// The exact scenario the task is about: a link mark's `href` must
    /// never leak into the indexed text, even though the anchor text
    /// itself must.
    #[test]
    fn excludes_a_link_marks_href_but_keeps_the_anchor_text() {
        let json = r#"{
            "type": "doc",
            "content": [{
                "type": "paragraph",
                "content": [{
                    "type": "text",
                    "text": "click here",
                    "marks": [{ "type": "link", "attrs": { "href": "https://secret.example/plan" } }]
                }]
            }]
        }"#;
        let text = extract_plain_text(json);
        assert_eq!(text, "click here");
        assert!(!text.contains("secret"), "href must not leak into indexed text: {text}");
    }

    /// A node's own `attrs` (not a mark's) must be excluded too — e.g. an
    /// image's `src`/`alt`.
    #[test]
    fn excludes_node_attrs() {
        let json = r#"{
            "type": "doc",
            "content": [{
                "type": "image",
                "attrs": { "src": "soma-blob://abc123", "alt": "a confidential filename" }
            }]
        }"#;
        assert_eq!(extract_plain_text(json), "");
    }

    /// Node type names (`"paragraph"`, `"image"`, ...) are plain strings
    /// in the JSON too, but must never be collected — only strings under
    /// a `"text"` key count.
    #[test]
    fn does_not_collect_node_type_names() {
        let json = r#"{"type":"doc","content":[{"type":"paragraph","content":[]}]}"#;
        assert_eq!(extract_plain_text(json), "");
    }

    #[test]
    fn returns_empty_string_for_invalid_json() {
        assert_eq!(extract_plain_text("not json at all"), "");
    }

    #[test]
    fn returns_empty_string_for_an_empty_document() {
        assert_eq!(extract_plain_text(r#"{"type":"doc","content":[]}"#), "");
    }
}

#[cfg(test)]
mod repository_tests {
    //! Exercises `SqlDocumentRepository` against a REAL (in-memory)
    //! SQLite connection, not a hand-rolled fake — the LWW tie-break in
    //! `upsert_document_if_newer` lives entirely in the `WHERE` clause of
    //! a single `ON CONFLICT ... DO UPDATE` statement, and only running
    //! that actual SQL against a real conflict proves it's correct.
    //! Mirrors `invites.rs::tests::repo`'s pattern (see that module's doc
    //! comment for the fuller rationale).
    use super::*;

    async fn repo() -> SqlDocumentRepository {
        static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");
        // `sqlite::memory:` gives every *connection* its own isolated
        // database — pin the pool to one connection so every query in a
        // test lands on the same in-memory database (see
        // `agent_config.rs::tests::repo`'s identical comment).
        let pool = soma_core::db::DbFactory::any("sqlite::memory:", &MIGRATOR)
            .max_connections(1)
            .build_any()
            .await
            .expect("build in-memory pool");
        SqlDocumentRepository::new(pool)
    }

    fn sample(
        space_id: &str,
        document_id: &str,
        updated_at_ms: i64,
        origin_peer_id: &str,
        published: bool,
        content: &str,
    ) -> Document {
        Document {
            space_id: space_id.to_string(),
            document_id: document_id.to_string(),
            content_json: content.to_string(),
            published,
            updated_at_ms,
            origin_peer_id: origin_peer_id.to_string(),
        }
    }

    #[tokio::test]
    async fn upsert_if_newer_applies_a_strictly_newer_incoming_version() {
        let repo = repo().await;
        repo.upsert_document(&sample("space-1", "doc-1", 1_000, "peer-a", false, "old"))
            .await
            .expect("seed");

        let applied = repo
            .upsert_document_if_newer(&sample("space-1", "doc-1", 2_000, "peer-a", true, "new"))
            .await
            .expect("upsert_document_if_newer");
        assert!(applied, "a strictly newer updated_at_ms must be applied");

        let stored = repo
            .get_document("space-1", "doc-1")
            .await
            .expect("get")
            .expect("row exists");
        assert_eq!(stored.content_json, "new");
        assert_eq!(stored.updated_at_ms, 2_000);
        assert!(stored.published);
    }

    #[tokio::test]
    async fn upsert_if_newer_rejects_a_strictly_older_incoming_version() {
        let repo = repo().await;
        repo.upsert_document(&sample("space-1", "doc-1", 2_000, "peer-a", false, "current"))
            .await
            .expect("seed");

        let applied = repo
            .upsert_document_if_newer(&sample("space-1", "doc-1", 1_000, "peer-a", true, "stale"))
            .await
            .expect("upsert_document_if_newer");
        assert!(!applied, "a strictly older updated_at_ms must be rejected");

        let stored = repo
            .get_document("space-1", "doc-1")
            .await
            .expect("get")
            .expect("row exists");
        assert_eq!(
            stored.content_json, "current",
            "storage must be left untouched by a losing write"
        );
        assert_eq!(stored.updated_at_ms, 2_000);
        assert!(!stored.published);
    }

    #[tokio::test]
    async fn upsert_if_newer_equal_timestamp_higher_origin_peer_id_wins() {
        let repo = repo().await;
        repo.upsert_document(&sample("space-1", "doc-1", 2_000, "peer-a", false, "current"))
            .await
            .expect("seed");

        let applied = repo
            .upsert_document_if_newer(&sample("space-1", "doc-1", 2_000, "peer-b", false, "new"))
            .await
            .expect("upsert_document_if_newer");
        assert!(applied, "on a timestamp tie, the higher origin_peer_id must win");

        let stored = repo
            .get_document("space-1", "doc-1")
            .await
            .expect("get")
            .expect("row exists");
        assert_eq!(stored.content_json, "new");
        assert_eq!(stored.origin_peer_id, "peer-b");
    }

    #[tokio::test]
    async fn upsert_if_newer_equal_timestamp_lower_origin_peer_id_loses() {
        let repo = repo().await;
        repo.upsert_document(&sample("space-1", "doc-1", 2_000, "peer-b", false, "current"))
            .await
            .expect("seed");

        let applied = repo
            .upsert_document_if_newer(&sample("space-1", "doc-1", 2_000, "peer-a", false, "new"))
            .await
            .expect("upsert_document_if_newer");
        assert!(!applied, "on a timestamp tie, a lower origin_peer_id must lose");

        let stored = repo
            .get_document("space-1", "doc-1")
            .await
            .expect("get")
            .expect("row exists");
        assert_eq!(
            stored.content_json, "current",
            "storage must be left untouched by a losing write"
        );
        assert_eq!(stored.origin_peer_id, "peer-b");
    }

    #[tokio::test]
    async fn upsert_if_newer_identical_version_is_an_idempotent_no_op() {
        let repo = repo().await;
        repo.upsert_document(&sample("space-1", "doc-1", 2_000, "peer-a", false, "current"))
            .await
            .expect("seed");

        let applied = repo
            .upsert_document_if_newer(&sample(
                "space-1", "doc-1", 2_000, "peer-a", true, "replayed",
            ))
            .await
            .expect("upsert_document_if_newer");
        assert!(
            !applied,
            "replaying an identical (updated_at_ms, origin_peer_id) must be a no-op"
        );

        let stored = repo
            .get_document("space-1", "doc-1")
            .await
            .expect("get")
            .expect("row exists");
        assert_eq!(
            stored.content_json, "current",
            "an identical-version replay must not touch storage"
        );
        assert!(!stored.published);
    }

    #[tokio::test]
    async fn upsert_if_newer_first_time_insert_into_empty_table_returns_true() {
        let repo = repo().await;

        let applied = repo
            .upsert_document_if_newer(&sample("space-1", "doc-1", 1_000, "peer-a", false, "first"))
            .await
            .expect("upsert_document_if_newer");
        assert!(applied, "a first-time insert has no conflict and must always be applied");

        let stored = repo
            .get_document("space-1", "doc-1")
            .await
            .expect("get")
            .expect("row exists");
        assert_eq!(stored.content_json, "first");
        assert_eq!(stored.origin_peer_id, "peer-a");
    }

    #[tokio::test]
    async fn list_document_digests_returns_rows_for_the_space_and_excludes_others() {
        let repo = repo().await;
        repo.upsert_document(&sample("space-1", "doc-b", 1_000, "peer-a", false, "b"))
            .await
            .expect("seed");
        repo.upsert_document(&sample("space-1", "doc-a", 2_000, "peer-b", true, "a"))
            .await
            .expect("seed");
        repo.upsert_document(&sample("space-2", "doc-x", 3_000, "peer-c", false, "x"))
            .await
            .expect("seed");

        let digests = repo
            .list_document_digests("space-1")
            .await
            .expect("list_document_digests");
        assert_eq!(digests.len(), 2, "must only include space-1's own documents");
        assert_eq!(digests[0].document_id, "doc-a", "digests must be ordered by document_id");
        assert_eq!(digests[0].updated_at_ms, 2_000);
        assert_eq!(digests[0].origin_peer_id, "peer-b");
        assert!(digests[0].published);
        assert_eq!(digests[1].document_id, "doc-b");
        assert_eq!(digests[1].updated_at_ms, 1_000);
        assert_eq!(digests[1].origin_peer_id, "peer-a");
        assert!(!digests[1].published);
        assert!(
            digests.iter().all(|d| d.document_id != "doc-x"),
            "must not include another space's documents: {digests:?}"
        );
    }
}
