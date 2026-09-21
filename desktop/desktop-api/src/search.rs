//! Search across pages (by title), documents (by extracted plain text),
//! and spaces (by display name) — scoped to spaces the caller is a
//! member of. See `soma_daemon::DaemonHandle::search`'s doc comment for
//! the membership-scoping rule and result cap, and
//! `soma_storage::search`'s module doc for why matching goes through an
//! extracted `plain_text` column instead of raw Tiptap JSON, and why not
//! SQLite FTS5.

use desktop_core::error::{DesktopError, DesktopResult};
use serde::Serialize;
use soma_daemon::handle_types as dt;
use specta::Type;

use crate::state::AppState;

// --- DTOs --------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum SearchResultKind {
    Space,
    Page,
    Document,
}

impl From<dt::SearchResultKind> for SearchResultKind {
    fn from(kind: dt::SearchResultKind) -> Self {
        match kind {
            dt::SearchResultKind::Space => Self::Space,
            dt::SearchResultKind::Page => Self::Page,
            dt::SearchResultKind::Document => Self::Document,
        }
    }
}

/// One search hit. Maps cleanly onto `@soma/ui`'s `CommandPaletteItem`
/// (`id`, `title`, `subtitle`, `section`): `spaceName` is the natural
/// `subtitle`, `kind` plus `spaceId`/`id` are enough to build the right
/// route and `onSelect`, and `snippet` (set for `document` hits only)
/// gives the palette a reason to show *why* something matched.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub kind: SearchResultKind,
    pub space_id: String,
    pub space_name: String,
    pub id: String,
    pub title: String,
    pub snippet: Option<String>,
    #[specta(type = i32)]
    pub updated_at_ms: i64,
}

impl From<dt::SearchResultRecord> for SearchResult {
    fn from(r: dt::SearchResultRecord) -> Self {
        Self {
            kind: r.kind.into(),
            space_id: r.space_id,
            space_name: r.space_name,
            id: r.id,
            title: r.title,
            snippet: r.snippet,
            updated_at_ms: r.updated_at_ms,
        }
    }
}

// --- Handlers ----------------------------------------------------------------

fn err(e: impl std::fmt::Display) -> DesktopError {
    DesktopError::Daemon {
        message: e.to_string(),
    }
}

/// `query: None` (no argument sent) and `query: Some("")` both mean "no
/// query" — normalized to `""` here so `DaemonHandle::search` has a
/// single shape to reason about; it applies the actual trim + empty
/// check (an empty/whitespace-only query returns `[]`, never every row).
pub async fn query(state: &AppState, query: Option<String>) -> DesktopResult<Vec<SearchResult>> {
    let handle = state.daemon.handle().await?;
    let hits = handle.search(&query.unwrap_or_default()).await.map_err(err)?;
    Ok(hits.into_iter().map(SearchResult::from).collect())
}
