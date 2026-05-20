//! Tauri presenter for `desktop_api::search::*`. The handler returns an
//! empty list today — see the API crate for the reason.

use desktop_api::search::{self as api, SearchResult};
use desktop_core::error::DesktopResult;

#[tauri::command]
#[specta::specta]
pub async fn search(query: Option<String>) -> DesktopResult<Vec<SearchResult>> {
    api::query(query).await
}
