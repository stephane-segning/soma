//! Tauri presenter for `desktop_api::search::*`.

use desktop_api::{
    AppState,
    search::{self as api, SearchResult},
};
use desktop_core::error::DesktopResult;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn search(state: State<'_, AppState>, query: Option<String>) -> DesktopResult<Vec<SearchResult>> {
    api::query(state.inner(), query).await
}
