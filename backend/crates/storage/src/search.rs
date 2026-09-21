//! Cross-aggregate search — pages (by title), documents (by extracted
//! plain text), and spaces (by display name) — scoped to whichever
//! spaces the querying peer is a member of.
//!
//! # Membership scoping
//!
//! Every query here `INNER JOIN`s through `space_memberships` on the
//! caller's own `subject_peer_id` — the same source of truth
//! `backend/crates/daemon/src/handle/revoke.rs` and `handle/agent_config.rs`
//! read for other daemon-level authorization decisions. Unlike those two
//! (which authorize-then-maybe-reject a single mutating call), search
//! has no separate "reject" step: the join itself IS the authorization.
//! A space with no membership row for the caller contributes zero
//! candidate rows to any of the three queries below, so there is nothing
//! to leak across the membership boundary — this cannot become a side
//! door around it the way an unscoped `WHERE` clause plus an
//! application-level filter could (a bug in the filter would still leave
//! the over-broad query underneath).
//!
//! # Why a `plain_text` column instead of searching `content_json` directly
//!
//! `documents.content_json` is Tiptap/ProseMirror JSON — a tree of nodes
//! with `type`, `attrs`, `marks`, and (for leaf nodes) `text` fields. A
//! naive `LIKE '%term%'` over that raw JSON string would also match node
//! type names (`"paragraph"`, `"bulletList"`), attribute keys, and URL
//! values sitting in a `link` mark's `attrs.href` — none of which the
//! user actually sees or typed. `documents.plain_text` (added by
//! `20260923000000_search.sql`) holds a flattened, user-visible-only
//! rendering, extracted at write time by
//! [`crate::documents`]'s internal `extract_plain_text`, every time
//! `SqlDocumentRepository::upsert_document` runs (every document write
//! path — `documents.upsert`, `upsertDraft`, `queueDaemonSync`,
//! `syncPublishedDocument` — funnels through that one method, so this is
//! a single choke point, not four).
//!
//! This trades a small amount of write-time CPU (and duplicated
//! storage) for query-time correctness and speed: the alternative,
//! parsing `content_json` on every search keystroke, would redo the same
//! JSON walk on every candidate row on every query instead of once per
//! write. Existing rows written before this migration have an empty
//! `plain_text` until their next save — there is no backfill migration
//! (pre-prod, breaking changes are fine per AGENTS.md).
//!
//! # Why not SQLite FTS5
//!
//! `backend/crates/storage/migrations` is the SAME migrations directory
//! `somad bot` runs against Postgres (via `sqlx::Any`) as well as
//! against SQLite (the desktop host) — see AGENTS.md's "Storage"
//! section. FTS5 is a SQLite-only virtual-table mechanism (`CREATE
//! VIRTUAL TABLE ... USING fts5(...)`); Postgres has no such statement
//! at all, so an FTS5 migration would hard-fail the very first time
//! `somad bot` applied it against Postgres. Verified rather than
//! assumed: this workspace's `sqlx` feature list
//! (`[workspace.dependencies]` in the root `Cargo.toml`) does not
//! request `libsqlite3-sys`'s `bundled` feature directly for the
//! `sqlite` feature — `cargo tree -e features` shows it only ends up
//! enabled as a side effect of `sqlx-macros-core`'s compile-time query
//! checking also depending on it — and `libsqlite3-sys` 0.30.1 (the
//! pinned version) has no Cargo feature for FTS5 specifically; it would
//! be an unconditional, unverified-at-this-pin `-DSQLITE_ENABLE_FTS5` in
//! the vendored build. Even setting the Postgres blocker aside, that's
//! exactly the kind of fragile, version-and-platform-dependent
//! complexity the app's four-target build (macOS/Linux/iOS/Android) can
//! do without. Plain indexed `LIKE` queries behave identically
//! everywhere this schema runs.
//!
//! # Complexity, and where this falls over
//!
//! Each per-kind query below is, in effect, an index-assisted narrowing
//! to the caller's own candidate rows (`space_memberships` joined on
//! `subject_peer_id`, using the index `20260923000000_search.sql` adds;
//! `pages`/`documents` further narrowed by their existing `space_id`
//! indexes) followed by a linear `LIKE` scan of *those* rows only —
//! never a scan of the whole table. Cost is O(rows across the caller's
//! own member spaces), not O(rows in the database). For a local-first,
//! single-user desktop install with realistic space/page/document counts
//! (tens to low hundreds per space) this is effectively instant.
//!
//! It would start to matter once a single install's total member-space
//! row count reaches the tens of thousands, because a leading-wildcard
//! `LIKE '%term%'` can't be accelerated by any B-tree index — at that
//! point the fix is FTS5 on the SQLite/desktop path specifically (not
//! the shared cross-database migration), or a dedicated,
//! incrementally-maintained search-index table.

use async_trait::async_trait;
use soma_core::{Error, SomaResult};
use sqlx::Row;
use sqlx_utils::types::Pool;

/// What a [`SearchHit`] refers to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SearchHitKind {
    Space,
    Page,
    Document,
}

/// One search hit. `space_name` is always the owning space's display
/// name — including for a `Space`-kind hit, where it duplicates `title`
/// — so callers never need to special-case which field carries it (e.g.
/// to render a `CommandPaletteItem`'s `subtitle`). `updated_at_ms` is
/// always milliseconds: a `Space` hit's timestamp is `spaces.created_at`
/// (stored in *seconds*) converted at read time, so every kind sorts on
/// the same clock.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchHit {
    pub kind: SearchHitKind,
    pub space_id: String,
    pub space_name: String,
    pub id: String,
    pub title: String,
    /// Short excerpt around the match, for `Document` hits only —
    /// `None` for `Space`/`Page` hits, where `title` already IS the text
    /// that matched.
    pub snippet: Option<String>,
    pub updated_at_ms: i64,
}

#[async_trait]
pub trait SearchRepository: Send + Sync {
    /// Search pages (by title), documents (by extracted plain text), and
    /// spaces (by display name), each independently capped at
    /// `limit_per_kind` and scoped to spaces `subject_peer_id` is a
    /// member of.
    ///
    /// `query` must already be trimmed and non-empty — callers (see
    /// `soma_daemon::DaemonHandle::search`) are expected to short-circuit
    /// an empty query before reaching storage; this method does not
    /// special-case it; an empty `query` would (correctly, mechanically)
    /// match every row, which is exactly the "browse everything"
    /// behavior a search box must not have.
    async fn search(
        &self,
        subject_peer_id: &str,
        query: &str,
        limit_per_kind: u32,
    ) -> SomaResult<Vec<SearchHit>>;
}

#[derive(Clone, Debug)]
pub struct SqlSearchRepository {
    pool: Pool,
}

impl SqlSearchRepository {
    pub fn new(pool: Pool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl SearchRepository for SqlSearchRepository {
    async fn search(
        &self,
        subject_peer_id: &str,
        query: &str,
        limit_per_kind: u32,
    ) -> SomaResult<Vec<SearchHit>> {
        // Matching precedent: `membership::spaces::list_spaces` also
        // lowercases both sides rather than relying on SQLite's
        // ASCII-only case-insensitive `LIKE`, since this query also runs
        // against Postgres (case-sensitive `LIKE`) for `somad bot`. Not
        // escaped against a literal `%`/`_` in the user's own query,
        // same as that existing precedent — a user typing `%` searches
        // for "matches everything" rather than a literal percent sign,
        // which is a pre-existing, deliberately-unfixed quirk elsewhere
        // in this codebase, not one introduced here.
        let like = format!("%{}%", query.to_lowercase());

        let mut hits = search_spaces(&self.pool, subject_peer_id, &like, limit_per_kind).await?;
        hits.extend(search_pages(&self.pool, subject_peer_id, &like, limit_per_kind).await?);
        hits.extend(
            search_documents(&self.pool, subject_peer_id, query, &like, limit_per_kind).await?,
        );
        Ok(hits)
    }
}

async fn search_spaces(
    pool: &Pool,
    subject_peer_id: &str,
    like: &str,
    limit: u32,
) -> SomaResult<Vec<SearchHit>> {
    let rows = sqlx::query(
        r#"
        SELECT s.space_id, s.display_name, (s.created_at * 1000) AS updated_at_ms
        FROM spaces s
        INNER JOIN space_memberships sm
            ON sm.space_id = s.space_id AND sm.subject_peer_id = $1
        WHERE LOWER(COALESCE(s.display_name, '')) LIKE $2
        ORDER BY s.created_at DESC
        LIMIT $3
        "#,
    )
    .bind(subject_peer_id)
    .bind(like)
    .bind(limit as i64)
    .fetch_all(pool)
    .await
    .map_err(Error::service)?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let space_id: String = row.get("space_id");
            let display_name: Option<String> = row.get("display_name");
            let name = display_name.unwrap_or_default();
            SearchHit {
                kind: SearchHitKind::Space,
                space_id: space_id.clone(),
                space_name: name.clone(),
                id: space_id,
                title: name,
                snippet: None,
                updated_at_ms: row.get("updated_at_ms"),
            }
        })
        .collect())
}

async fn search_pages(
    pool: &Pool,
    subject_peer_id: &str,
    like: &str,
    limit: u32,
) -> SomaResult<Vec<SearchHit>> {
    let rows = sqlx::query(
        r#"
        SELECT p.space_id, p.page_id, p.title, p.updated_at_ms,
               COALESCE(sp.display_name, '') AS space_name
        FROM pages p
        INNER JOIN space_memberships sm
            ON sm.space_id = p.space_id AND sm.subject_peer_id = $1
        LEFT JOIN spaces sp ON sp.space_id = p.space_id
        WHERE LOWER(p.title) LIKE $2
        ORDER BY p.updated_at_ms DESC
        LIMIT $3
        "#,
    )
    .bind(subject_peer_id)
    .bind(like)
    .bind(limit as i64)
    .fetch_all(pool)
    .await
    .map_err(Error::service)?;

    Ok(rows
        .into_iter()
        .map(|row| SearchHit {
            kind: SearchHitKind::Page,
            space_id: row.get("space_id"),
            space_name: row.get("space_name"),
            id: row.get("page_id"),
            title: row.get("title"),
            snippet: None,
            updated_at_ms: row.get("updated_at_ms"),
        })
        .collect())
}

async fn search_documents(
    pool: &Pool,
    subject_peer_id: &str,
    query: &str,
    like: &str,
    limit: u32,
) -> SomaResult<Vec<SearchHit>> {
    // `pg.title` via a LEFT JOIN on `pages` keyed by `(space_id,
    // document_id = page_id)`: in this app's actual usage every document
    // is a page's content (`documentId === pageId` — see
    // `desktop-app/src/routes/page-view.tsx`'s `getDraft`/`upsertDraft`
    // calls), but the schema has no FK enforcing that, so a document
    // with no matching page row still returns (with an empty title)
    // rather than being silently dropped.
    let rows = sqlx::query(
        r#"
        SELECT d.space_id, d.document_id, d.plain_text, d.updated_at_ms,
               COALESCE(pg.title, '') AS page_title,
               COALESCE(sp.display_name, '') AS space_name
        FROM documents d
        INNER JOIN space_memberships sm
            ON sm.space_id = d.space_id AND sm.subject_peer_id = $1
        LEFT JOIN pages pg
            ON pg.space_id = d.space_id AND pg.page_id = d.document_id
        LEFT JOIN spaces sp ON sp.space_id = d.space_id
        WHERE LOWER(d.plain_text) LIKE $2
        ORDER BY d.updated_at_ms DESC
        LIMIT $3
        "#,
    )
    .bind(subject_peer_id)
    .bind(like)
    .bind(limit as i64)
    .fetch_all(pool)
    .await
    .map_err(Error::service)?;

    Ok(rows
        .into_iter()
        .map(|row| {
            let plain_text: String = row.get("plain_text");
            SearchHit {
                kind: SearchHitKind::Document,
                space_id: row.get("space_id"),
                space_name: row.get("space_name"),
                id: row.get("document_id"),
                title: row.get("page_title"),
                snippet: build_snippet(&plain_text, query),
                updated_at_ms: row.get("updated_at_ms"),
            }
        })
        .collect())
}

/// Bytes of context kept on each side of the match in [`build_snippet`].
/// A byte (not char) radius, so the window can land a few visible
/// characters short for multi-byte text — an acceptable trade for a
/// cosmetic excerpt, in exchange for `snap_to_char_boundary` being able
/// to guarantee no panic and no split codepoint on any input.
const SNIPPET_RADIUS_BYTES: usize = 60;

/// A short, single-line excerpt of `text` centered on the first
/// case-insensitive occurrence of `query`, so the palette can show *why*
/// a document matched instead of just that it did. `None` when `query`
/// isn't found in `text` (defensive: shouldn't happen given the caller
/// only reaches this for rows the SQL `WHERE LOWER(plain_text) LIKE`
/// clause already matched, but a pure function shouldn't assume its
/// caller got that right) or either input is empty.
fn build_snippet(text: &str, query: &str) -> Option<String> {
    if text.is_empty() || query.is_empty() {
        return None;
    }
    // Byte offsets are derived from the *lowered* strings and then
    // reused directly against the original `text`. This is exactly
    // right whenever lowercasing doesn't change a string's byte length
    // (true for effectively all real-world content this app indexes —
    // ASCII/Latin/CJK/emoji text). For the rare Unicode case where it
    // does (e.g. 'İ' U+0130 lowercasing to a longer two-codepoint
    // sequence), the window can land a few bytes off-center; it still
    // can't panic or split a codepoint, since `snap_to_char_boundary`
    // clamps and re-snaps unconditionally. Acceptable for a cosmetic
    // excerpt — this is not a correctness-critical path.
    let lower_text = text.to_lowercase();
    let lower_query = query.to_lowercase();
    let match_start = lower_text.find(&lower_query)?;
    let match_end = match_start + lower_query.len();

    let start = snap_to_char_boundary(text, match_start.saturating_sub(SNIPPET_RADIUS_BYTES), false);
    let end = snap_to_char_boundary(text, (match_end + SNIPPET_RADIUS_BYTES).min(text.len()), true);

    let prefix = if start > 0 { "…" } else { "" };
    let suffix = if end < text.len() { "…" } else { "" };
    Some(format!("{prefix}{}{suffix}", text[start..end].trim()))
}

/// Walks `idx` to the nearest valid UTF-8 char boundary in `text` —
/// backward (`forward = false`) or forward (`forward = true`) — so a
/// snippet window can never split a multi-byte codepoint. Always
/// terminates: `0` and `text.len()` are always boundaries.
fn snap_to_char_boundary(text: &str, idx: usize, forward: bool) -> usize {
    let mut idx = idx.min(text.len());
    while !text.is_char_boundary(idx) {
        if forward {
            idx += 1;
        } else {
            idx -= 1;
        }
    }
    idx
}

#[cfg(test)]
mod snippet_tests {
    use super::*;

    #[test]
    fn centers_the_match_with_ellipses_on_both_sides() {
        let text = "a".repeat(100) + "needle" + &"b".repeat(100);
        let snippet = build_snippet(&text, "needle").expect("match found");
        assert!(snippet.starts_with('…'), "{snippet}");
        assert!(snippet.ends_with('…'), "{snippet}");
        assert!(snippet.contains("needle"), "{snippet}");
    }

    #[test]
    fn no_leading_ellipsis_when_match_is_near_the_start() {
        let snippet = build_snippet("needle at the very start of a short text", "needle").expect("match");
        assert!(!snippet.starts_with('…'), "{snippet}");
    }

    #[test]
    fn no_trailing_ellipsis_when_match_is_near_the_end() {
        let snippet = build_snippet("a short text ending in needle", "needle").expect("match");
        assert!(!snippet.ends_with('…'), "{snippet}");
    }

    #[test]
    fn is_case_insensitive() {
        let snippet = build_snippet("some NeEdLe here", "needle").expect("match");
        assert!(snippet.contains("NeEdLe"));
    }

    #[test]
    fn returns_none_when_the_query_is_not_present() {
        assert_eq!(build_snippet("no match in here", "xyz"), None);
    }

    #[test]
    fn returns_none_for_empty_inputs() {
        assert_eq!(build_snippet("", "needle"), None);
        assert_eq!(build_snippet("some text", ""), None);
    }

    #[test]
    fn never_panics_or_splits_a_codepoint_near_a_multi_byte_match() {
        // "term" surrounded by multi-byte emoji well within the snippet
        // radius on both sides — must not panic, and the returned
        // snippet must be valid UTF-8 (guaranteed by the type system
        // once construction doesn't panic).
        let text = "🎉".repeat(80) + "term" + &"🎉".repeat(80);
        let snippet = build_snippet(&text, "term").expect("match found");
        assert!(snippet.contains("term"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::RepositoryFactory;
    use crate::documents::{Document, DocumentRepository};
    use crate::membership::{MembershipRepository, Space, SpaceMembership};
    use crate::pages::{Page, PageRepository};

    /// Real (in-memory) SQLite, exercised through a full
    /// [`RepositoryFactory`] so a single test can seed spaces,
    /// memberships, pages, and documents through their own repositories
    /// and then assert on `SqlSearchRepository`'s behavior against real
    /// SQL — mirroring `invites.rs::tests::repo`'s pattern (see that
    /// module's doc comment for why a real DB, not a hand-rolled fake,
    /// is what actually proves a `WHERE`/`JOIN` clause is correct).
    async fn factory() -> RepositoryFactory {
        static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");
        let pool = soma_core::db::DbFactory::any("sqlite::memory:", &MIGRATOR)
            .max_connections(1)
            .build_any()
            .await
            .expect("build in-memory pool");
        RepositoryFactory::new(pool)
    }

    /// Creates a space and an owner membership row for `peer_id`, with a
    /// display name derived from `space_id` so a test can search for it
    /// deterministically.
    async fn seed_membership(factory: &RepositoryFactory, space_id: &str, peer_id: &str) {
        let membership_repo = factory.membership();
        membership_repo
            .upsert_space(&Space {
                space_id: space_id.to_string(),
                display_name: Some(format!("{space_id} display")),
                owner_peer_id: Some(peer_id.to_string()),
                created_at: 1_000,
            })
            .await
            .expect("upsert space");
        membership_repo
            .upsert_membership(&SpaceMembership {
                space_id: space_id.to_string(),
                subject_peer_id: peer_id.to_string(),
                role: "owner".to_string(),
                issuer_peer_id: peer_id.to_string(),
                issued_at: 1_000,
                expires_at: None,
                capability: None,
            })
            .await
            .expect("upsert membership");
    }

    #[tokio::test]
    async fn finds_a_page_by_title() {
        let factory = factory().await;
        seed_membership(&factory, "space-1", "peer-1").await;
        factory
            .pages()
            .create_page(&Page {
                space_id: "space-1".into(),
                page_id: "page-1".into(),
                title: "Quarterly Roadmap".into(),
                parent_page_ids: vec![],
                created_at_ms: 1,
                updated_at_ms: 1,
            })
            .await
            .expect("create page");

        let hits = factory
            .search()
            .search("peer-1", "roadmap", 10)
            .await
            .expect("search");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].kind, SearchHitKind::Page);
        assert_eq!(hits[0].id, "page-1");
        assert_eq!(hits[0].title, "Quarterly Roadmap");
        assert_eq!(hits[0].space_name, "space-1 display");
    }

    /// The regression case the task is actually about: a document's
    /// content is findable via its extracted plain text, but the raw
    /// JSON's own structure (a node type name) is not — proving the
    /// `plain_text` design in this module's doc comment actually works,
    /// not just that *some* text matches *some* query.
    #[tokio::test]
    async fn finds_a_document_by_content_but_not_by_its_json_structure() {
        let factory = factory().await;
        seed_membership(&factory, "space-1", "peer-1").await;
        factory
            .documents()
            .upsert_document(&Document {
                space_id: "space-1".into(),
                document_id: "doc-1".into(),
                content_json: r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"the launch codes are hidden here"}]}]}"#.into(),
                published: true,
                updated_at_ms: 1,
                origin_peer_id: String::new(),
            })
            .await
            .expect("upsert document");

        let hits = factory
            .search()
            .search("peer-1", "launch codes", 10)
            .await
            .expect("search");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].kind, SearchHitKind::Document);
        assert_eq!(hits[0].id, "doc-1");
        assert!(hits[0].snippet.as_deref().unwrap_or_default().contains("launch codes"));

        let structural = factory
            .search()
            .search("peer-1", "paragraph", 10)
            .await
            .expect("search");
        assert!(
            structural.is_empty(),
            "a Tiptap node type name must not be a search hit: {structural:?}"
        );
    }

    #[tokio::test]
    async fn finds_a_space_by_display_name() {
        let factory = factory().await;
        seed_membership(&factory, "space-1", "peer-1").await;

        let hits = factory
            .search()
            .search("peer-1", "space-1 display", 10)
            .await
            .expect("search");
        assert_eq!(hits.iter().filter(|h| h.kind == SearchHitKind::Space).count(), 1);
    }

    /// Mandatory regression test: the membership boundary must actually
    /// hold. A peer that is a member of one space must never see hits
    /// from a *different* space it has no membership row for, even
    /// though both spaces exist in the same local database.
    #[tokio::test]
    async fn a_non_member_never_sees_another_spaces_hits() {
        let factory = factory().await;
        seed_membership(&factory, "space-mine", "peer-1").await;
        seed_membership(&factory, "space-theirs", "peer-2").await; // peer-1 is NOT a member of this one
        factory
            .pages()
            .create_page(&Page {
                space_id: "space-theirs".into(),
                page_id: "page-secret".into(),
                title: "Confidential Plan".into(),
                parent_page_ids: vec![],
                created_at_ms: 1,
                updated_at_ms: 1,
            })
            .await
            .expect("create page");
        factory
            .documents()
            .upsert_document(&Document {
                space_id: "space-theirs".into(),
                document_id: "page-secret".into(),
                content_json: r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"confidential contents"}]}]}"#.into(),
                published: true,
                updated_at_ms: 1,
                origin_peer_id: String::new(),
            })
            .await
            .expect("upsert document");

        let page_hits = factory
            .search()
            .search("peer-1", "confidential", 10)
            .await
            .expect("search");
        assert!(
            page_hits.is_empty(),
            "a non-member must not see another space's page/document hits: {page_hits:?}"
        );

        // Confirm it's really the membership join doing the work, not a
        // typo in the fixture: the actual member can see it.
        let owners_hits = factory
            .search()
            .search("peer-2", "confidential", 10)
            .await
            .expect("search");
        assert_eq!(owners_hits.len(), 2, "the member should see both the page and document hit");
    }

    #[tokio::test]
    async fn caps_results_at_the_per_kind_limit_keeping_the_most_recently_updated() {
        let factory = factory().await;
        seed_membership(&factory, "space-1", "peer-1").await;
        for i in 0..5u32 {
            factory
                .pages()
                .create_page(&Page {
                    space_id: "space-1".into(),
                    page_id: format!("page-{i}"),
                    title: format!("Match {i}"),
                    parent_page_ids: vec![],
                    created_at_ms: i as i64,
                    updated_at_ms: i as i64,
                })
                .await
                .expect("create page");
        }

        let hits = factory
            .search()
            .search("peer-1", "match", 3)
            .await
            .expect("search");
        assert_eq!(hits.len(), 3);
        assert_eq!(
            hits.iter().map(|h| h.id.as_str()).collect::<Vec<_>>(),
            vec!["page-4", "page-3", "page-2"],
            "capped to the limit, most-recently-updated first"
        );
    }

    #[tokio::test]
    async fn a_page_with_no_matching_title_is_not_returned() {
        let factory = factory().await;
        seed_membership(&factory, "space-1", "peer-1").await;
        factory
            .pages()
            .create_page(&Page {
                space_id: "space-1".into(),
                page_id: "page-1".into(),
                title: "Unrelated title".into(),
                parent_page_ids: vec![],
                created_at_ms: 1,
                updated_at_ms: 1,
            })
            .await
            .expect("create page");

        let hits = factory
            .search()
            .search("peer-1", "roadmap", 10)
            .await
            .expect("search");
        assert!(hits.is_empty());
    }
}
