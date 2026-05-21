//! Tauri presenter for `desktop_api::documents::*`.
//!
//! Renderer-source `document-changed` broadcasts moved into the
//! `desktop-api` handlers themselves so the BFF can reuse the same
//! publish path (see `desktop_api::events::publish`). This file is now a
//! straight pass-through over `desktop_api::documents::*`.

use desktop_api::{
    AppState,
    documents::{
        self as api, DraftRecord, EnsurePageArgs, GetDraftArgs, QueueDaemonSyncArgs, SetPageParentsArgs, StoredDocument,
        StoredPage, SyncPublishedDocumentArgs, SyncPublishedDocumentResult, UpdatePageTitleArgs, UpsertDocumentArgs,
        UpsertDraftArgs,
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

// --- Drafts ------------------------------------------------------------------
//
// `document-changed` broadcasts are emitted by `desktop_api::documents::*`
// directly. These adapters stay thin.

#[tauri::command]
#[specta::specta]
pub async fn documents_get_draft(
    state: State<'_, AppState>,
    args: GetDraftArgs,
) -> DesktopResult<Option<DraftRecord>> {
    api::get_draft(state.inner(), args).await
}

#[tauri::command]
#[specta::specta]
pub async fn documents_upsert_draft(state: State<'_, AppState>, args: UpsertDraftArgs) -> DesktopResult<()> {
    api::upsert_draft(state.inner(), args).await
}

#[tauri::command]
#[specta::specta]
pub async fn documents_queue_daemon_sync(state: State<'_, AppState>, args: QueueDaemonSyncArgs) -> DesktopResult<()> {
    api::queue_daemon_sync(state.inner(), args).await
}

#[tauri::command]
#[specta::specta]
pub async fn documents_sync_published(
    state: State<'_, AppState>,
    args: SyncPublishedDocumentArgs,
) -> DesktopResult<SyncPublishedDocumentResult> {
    api::sync_published(state.inner(), args).await
}
