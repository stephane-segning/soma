//! Search — pages (by title), documents (by extracted plain text), and
//! spaces (by display name), scoped to spaces the local peer is a
//! member of.
//!
//! # Authorization
//!
//! Unlike `revoke.rs` / `agent_config.rs`, there is no separate
//! "authorize, then maybe reject" gate here. `soma_storage::search`'s
//! queries `INNER JOIN` through `space_memberships` on the caller's own
//! identity (`self.state.peer_id`, exactly what `super::ensure_membership`
//! checks for every other per-space handle method), so a space with no
//! membership row for this peer contributes zero candidate rows to any
//! of the three underlying queries. There is nothing to authorize
//! because there is nothing to reject — the membership boundary IS the
//! query. See `soma_storage::search`'s module doc for the full design.

use soma_core::SomaResult;
use soma_storage::search::{SearchHit, SearchHitKind};

use super::DaemonHandle;
use crate::handle::types::{SearchResultKind, SearchResultRecord};

/// Per-kind result cap (spaces, pages, and documents are each capped
/// independently — not a shared budget across all three — so one prolific
/// kind can't starve the others out of a result list). Chosen to
/// comfortably fill a command-palette-style dropdown without the
/// underlying query needing to scan deep into a large space; see
/// `soma_storage::search`'s module doc for the complexity/scaling notes
/// behind why this stays cheap.
const SEARCH_RESULT_LIMIT_PER_KIND: u32 = 8;

impl DaemonHandle {
    /// Search across every space this peer is a member of. An empty or
    /// whitespace-only query returns an empty list rather than "match
    /// everything" — this is a text search, not a browse-all fallback.
    pub async fn search(&self, query: &str) -> SomaResult<Vec<SearchResultRecord>> {
        let Some(query) = normalize_query(query) else {
            return Ok(Vec::new());
        };

        let caller = self.state.peer_id.to_string();
        let hits = self
            .state
            .repos
            .search_repo()
            .search(&caller, query, SEARCH_RESULT_LIMIT_PER_KIND)
            .await?;

        Ok(hits.into_iter().map(to_search_result_record).collect())
    }
}

/// Trims `query` and returns `None` when the result is empty. The caller
/// ([`DaemonHandle::search`]) treats `None` as "return no results" —
/// never falls through to an unfiltered `search_repo().search(...)`
/// call, which (by `SearchRepository::search`'s own contract) would
/// mechanically match every row via `LIKE '%%'`.
fn normalize_query(query: &str) -> Option<&str> {
    let trimmed = query.trim();
    (!trimmed.is_empty()).then_some(trimmed)
}

fn to_search_result_record(hit: SearchHit) -> SearchResultRecord {
    SearchResultRecord {
        kind: match hit.kind {
            SearchHitKind::Space => SearchResultKind::Space,
            SearchHitKind::Page => SearchResultKind::Page,
            SearchHitKind::Document => SearchResultKind::Document,
        },
        space_id: hit.space_id,
        space_name: hit.space_name,
        id: hit.id,
        title: hit.title,
        snippet: hit.snippet,
        updated_at_ms: hit.updated_at_ms,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Mandatory regression coverage: the guard `DaemonHandle::search`
    /// relies on to avoid ever running an unfiltered "match everything"
    /// query. Pure function, no `DaemonState` needed — mirrors
    /// `revoke.rs`'s `caller_is_owner_or_subject` / `agent_config.rs`'s
    /// `caller_is_space_owner` convention of extracting the interesting
    /// logic into a free function specifically so it's unit-testable
    /// without a live daemon.
    #[test]
    fn empty_query_normalizes_to_none() {
        assert_eq!(normalize_query(""), None);
    }

    #[test]
    fn whitespace_only_query_normalizes_to_none() {
        assert_eq!(normalize_query("   \t\n  "), None);
    }

    #[test]
    fn a_real_query_is_trimmed_but_kept() {
        assert_eq!(normalize_query("  roadmap  "), Some("roadmap"));
    }

    #[test]
    fn a_query_with_internal_whitespace_is_kept_as_is() {
        assert_eq!(normalize_query("launch codes"), Some("launch codes"));
    }
}
