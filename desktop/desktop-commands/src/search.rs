//! `search` placeholder. The old TS controller already returned `[]` —
//! the daemon doesn't expose a search endpoint yet. Reproduced here so
//! the renderer's `invoke<SearchResult[]>("search", ...)` call site
//! doesn't error with "command not found" during the cutover.

use desktop_core::error::DesktopResult;
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub kind: String,
    pub id: String,
    pub title: String,
    pub space_id: String,
}

#[tauri::command]
pub async fn search(_query: Option<String>) -> DesktopResult<Vec<SearchResult>> {
    Ok(Vec::new())
}
