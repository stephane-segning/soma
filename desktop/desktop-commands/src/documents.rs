//! Tauri presenter for `desktop_api::documents::*`.

use desktop_api::{
    AppState,
    documents::{
        self as api, EnsurePageArgs, SetPageParentsArgs, StoredDocument, StoredPage, UpdatePageTitleArgs,
        UpsertDocumentArgs,
    },
};
use desktop_core::error::DesktopResult;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn documents_upsert(state: State<'_, AppState>, args: UpsertDocumentArgs) -> DesktopResult<()> {
    api::upsert(state.inner(), args).await
}

#[tauri::command]
#[specta::specta]
pub async fn documents_get(
    state: State<'_, AppState>,
    space_id: String,
    document_id: String,
) -> DesktopResult<Option<StoredDocument>> {
    api::get(state.inner(), space_id, document_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn documents_ensure_page(state: State<'_, AppState>, args: EnsurePageArgs) -> DesktopResult<StoredPage> {
    api::ensure_page(state.inner(), args).await
}

#[tauri::command]
#[specta::specta]
pub async fn documents_list_pages(state: State<'_, AppState>, space_id: String) -> DesktopResult<Vec<StoredPage>> {
    api::list_pages(state.inner(), space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn documents_update_page_title(
    state: State<'_, AppState>,
    args: UpdatePageTitleArgs,
) -> DesktopResult<Option<StoredPage>> {
    api::update_page_title(state.inner(), args).await
}

#[tauri::command]
#[specta::specta]
pub async fn documents_set_page_parents(
    state: State<'_, AppState>,
    args: SetPageParentsArgs,
) -> DesktopResult<Option<StoredPage>> {
    api::set_page_parents(state.inner(), args).await
}
