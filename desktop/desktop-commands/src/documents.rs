//! Tauri presenter for `desktop_api::documents::*`.

use desktop_api::{
    AppState,
    documents::{
        self as api, DraftRecord, EnsurePageArgs, GetDraftArgs, QueueDaemonSyncArgs, SetPageParentsArgs, StoredDocument,
        StoredPage, SyncPublishedDocumentArgs, SyncPublishedDocumentResult, UpdatePageTitleArgs, UpsertDocumentArgs,
        UpsertDraftArgs,
    },
};
use desktop_core::error::DesktopResult;
use desktop_daemon::events::{DomainEvent, DomainEventSource};
use desktop_services::events::DomainEventsBroadcaster;
use tauri::State;

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn broadcast_document_changed(app: &tauri::AppHandle, space_id: String, document_id: String, reason: &'static str) {
    let event = DomainEvent::DocumentChanged {
        source: DomainEventSource::Renderer,
        at_ms: now_ms(),
        space_id,
        document_id,
        reason: Some(reason.into()),
    };
    if let Err(err) = DomainEventsBroadcaster::broadcast(app, &event) {
        tracing::warn!(?err, reason, "document-changed broadcast failed");
    }
}

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
// Each command mirrors an Electron IPC handler in
// `desktop/soma/src/main/command-registry/document-handlers.ts`. After the
// daemon call succeeds we re-broadcast a `document-changed` event with
// `source: "renderer"` so the renderer's domain-events service reacts the
// same way it does today on Electron.

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
pub async fn documents_upsert_draft(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    args: UpsertDraftArgs,
) -> DesktopResult<()> {
    let space_id = args.space_id.clone();
    let document_id = args.document_id.clone();
    api::upsert_draft(state.inner(), args).await?;
    broadcast_document_changed(&app, space_id, document_id, "documents_upsert_draft");
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn documents_queue_daemon_sync(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    args: QueueDaemonSyncArgs,
) -> DesktopResult<()> {
    let space_id = args.space_id.clone();
    let document_id = args.document_id.clone();
    api::queue_daemon_sync(state.inner(), args).await?;
    broadcast_document_changed(&app, space_id, document_id, "documents_queue_daemon_sync");
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn documents_sync_published(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    args: SyncPublishedDocumentArgs,
) -> DesktopResult<SyncPublishedDocumentResult> {
    let space_id = args.space_id.clone();
    let document_id = args.document_id.clone();
    let result = api::sync_published(state.inner(), args).await?;
    broadcast_document_changed(&app, space_id, document_id, "documents_sync_published");
    Ok(result)
}
