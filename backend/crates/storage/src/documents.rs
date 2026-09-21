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
}

#[async_trait]
pub trait DocumentRepository: Send + Sync {
    async fn upsert_document(&self, document: &Document) -> SomaResult<()>;
    async fn get_document(&self, space_id: &str, document_id: &str)
    -> SomaResult<Option<Document>>;
    async fn delete_documents_for_space(&self, space_id: &str) -> SomaResult<u64>;
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
            INSERT INTO documents (space_id, document_id, content_json, published, updated_at_ms, plain_text)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT(space_id, document_id)
            DO UPDATE SET
                content_json = excluded.content_json,
                published = excluded.published,
                updated_at_ms = excluded.updated_at_ms,
                plain_text = excluded.plain_text
            "#,
        )
        .bind(&document.space_id)
        .bind(&document.document_id)
        .bind(&document.content_json)
        .bind(if document.published { 1_i64 } else { 0_i64 })
        .bind(document.updated_at_ms)
        .bind(&plain_text)
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
            SELECT space_id, document_id, content_json, published, updated_at_ms
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
}

fn map_document_row(row: sqlx::any::AnyRow) -> Document {
    let published: i64 = row.get("published");
    Document {
        space_id: row.get("space_id"),
        document_id: row.get("document_id"),
        content_json: row.get("content_json"),
        published: published != 0,
        updated_at_ms: row.get("updated_at_ms"),
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
