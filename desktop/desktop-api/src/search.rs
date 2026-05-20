//! `search` placeholder — the daemon doesn't expose a search endpoint yet,
//! so the handler returns an empty list. Same shape as the legacy TS
//! controller.

use desktop_core::error::DesktopResult;
use serde::Serialize;
use specta::Type;

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub kind: String,
    pub id: String,
    pub title: String,
    pub space_id: String,
}

pub async fn query(_query: Option<String>) -> DesktopResult<Vec<SearchResult>> {
    Ok(Vec::new())
}
