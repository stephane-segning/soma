//! Document + page handlers. Wall-clock timestamps are filled in for
//! arguments that omit them so the renderer doesn't have to send them on
//! every call.

use desktop_core::error::{DesktopError, DesktopResult};
use desktop_core::time::now_ms;
use serde::{Deserialize, Serialize};
use specta::Type;
use soma_daemon::handle_types as dt;

use crate::state::AppState;

// --- DTOs --------------------------------------------------------------------

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StoredDocument {
    pub space_id: String,
    pub document_id: String,
    pub content_json: String,
    pub published: bool,
    #[specta(type = i32)]
    pub updated_at_ms: i64,
}

impl From<dt::DocumentRecord> for StoredDocument {
    fn from(r: dt::DocumentRecord) -> Self {
        Self {
            space_id: r.space_id,
            document_id: r.document_id,
            content_json: r.content_json,
            published: r.published,
            updated_at_ms: r.updated_at_ms,
        }
    }
}

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpsertDocumentArgs {
    pub space_id: String,
    pub document_id: String,
    pub content_json: String,
    #[serde(default)]
    pub published: bool,
    #[serde(default)]
    #[specta(type = Option<i32>)]
    pub updated_at_ms: Option<i64>,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StoredPage {
    pub space_id: String,
    pub page_id: String,
    pub title: String,
    pub parent_page_ids: Vec<String>,
    #[specta(type = i32)]
    pub created_at_ms: i64,
    #[specta(type = i32)]
    pub updated_at_ms: i64,
}

impl From<dt::PageRecord> for StoredPage {
    fn from(r: dt::PageRecord) -> Self {
        Self {
            space_id: r.space_id,
            page_id: r.page_id,
            title: r.title,
            parent_page_ids: r.parent_page_ids,
            created_at_ms: r.created_at_ms,
            updated_at_ms: r.updated_at_ms,
        }
    }
}

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EnsurePageArgs {
    pub space_id: String,
    pub page_id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub parent_page_ids: Vec<String>,
    #[serde(default)]
    #[specta(type = Option<i32>)]
    pub created_at_ms: Option<i64>,
    #[serde(default)]
    #[specta(type = Option<i32>)]
    pub updated_at_ms: Option<i64>,
}

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePageTitleArgs {
    pub space_id: String,
    pub page_id: String,
    pub title: String,
}

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SetPageParentsArgs {
    pub space_id: String,
    pub page_id: String,
    pub parent_page_ids: Vec<String>,
}

// --- Draft DTOs --------------------------------------------------------------
//
// The drafts surface is a thin alias over `upsertDocument` / `getDocument`
// in the daemon — there is no separate draft store. The Electron handlers
// (`desktop/soma/src/main/controllers/documents-controller.ts`) live as
// passthrough mappers; we mirror them verbatim here so the renderer can
// hit the same shapes from the Tauri transport.

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpsertDraftArgs {
    pub space_id: String,
    pub document_id: String,
    pub content_json: String,
    #[serde(default)]
    pub published: bool,
    #[serde(default)]
    #[specta(type = Option<i32>)]
    pub updated_at_ms: Option<i64>,
}

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct QueueDaemonSyncArgs {
    pub space_id: String,
    pub document_id: String,
    pub content_json: String,
    #[specta(type = i32)]
    pub updated_at_ms: i64,
    #[serde(default)]
    pub published: Option<bool>,
}

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncPublishedDocumentArgs {
    pub space_id: String,
    pub document_id: String,
    pub content_json: String,
    #[specta(type = i32)]
    pub updated_at_ms: i64,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncPublishedDocumentResult {
    pub uploaded: i32,
}

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GetDraftArgs {
    pub space_id: String,
    pub document_id: String,
}

/// Drafts row shape consumed by the renderer service today. `published`
/// is `1 | 0` rather than a bool so the wire shape matches what the
/// Electron handler emits.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DraftRecord {
    pub space_id: String,
    pub document_id: String,
    pub content_json: String,
    pub published: i32,
    #[specta(type = i32)]
    pub updated_at_ms: i64,
}

// --- Handlers ----------------------------------------------------------------

fn err(e: impl std::fmt::Display) -> DesktopError {
    DesktopError::Daemon { message: e.to_string() }
}

pub async fn upsert(state: &AppState, args: UpsertDocumentArgs) -> DesktopResult<()> {
    let handle = state.daemon.handle().await?;
    handle
        .upsert_document(dt::UpsertDocumentInput {
            space_id: args.space_id,
            document_id: args.document_id,
            content_json: args.content_json,
            published: args.published,
            updated_at_ms: args.updated_at_ms.unwrap_or_else(now_ms),
        })
        .await
        .map_err(err)
}

pub async fn get(state: &AppState, space_id: String, document_id: String) -> DesktopResult<Option<StoredDocument>> {
    let handle = state.daemon.handle().await?;
    let record = handle.get_document(&space_id, &document_id).await.map_err(err)?;
    Ok(record.map(StoredDocument::from))
}

pub async fn ensure_page(state: &AppState, args: EnsurePageArgs) -> DesktopResult<StoredPage> {
    let handle = state.daemon.handle().await?;
    let now = now_ms();
    let page = handle
        .ensure_page(dt::EnsurePageInput {
            space_id: args.space_id,
            page_id: args.page_id,
            title: args.title,
            parent_page_ids: args.parent_page_ids,
            created_at_ms: args.created_at_ms.unwrap_or(now),
            updated_at_ms: args.updated_at_ms.unwrap_or(now),
        })
        .await
        .map_err(err)?;
    Ok(page.into())
}

pub async fn list_pages(state: &AppState, space_id: String) -> DesktopResult<Vec<StoredPage>> {
    let handle = state.daemon.handle().await?;
    let pages = handle.list_pages(&space_id).await.map_err(err)?;
    Ok(pages.into_iter().map(StoredPage::from).collect())
}

pub async fn update_page_title(state: &AppState, args: UpdatePageTitleArgs) -> DesktopResult<Option<StoredPage>> {
    let handle = state.daemon.handle().await?;
    let page = handle
        .update_page_title(&args.space_id, &args.page_id, &args.title)
        .await
        .map_err(err)?;
    Ok(page.map(StoredPage::from))
}

pub async fn set_page_parents(state: &AppState, args: SetPageParentsArgs) -> DesktopResult<Option<StoredPage>> {
    let handle = state.daemon.handle().await?;
    let page = handle
        .set_page_parents(&args.space_id, &args.page_id, &args.parent_page_ids)
        .await
        .map_err(err)?;
    Ok(page.map(StoredPage::from))
}

// --- Draft handlers ----------------------------------------------------------
//
// Each mutating handler broadcasts a renderer-source `document-changed`
// event via `events::publish` after the daemon write succeeds. The
// presenter no longer needs to know about events — both Tauri and the
// (future) BFF subscribe to `AppState::domain_events` and forward
// however their transport requires.

pub async fn upsert_draft(state: &AppState, args: UpsertDraftArgs) -> DesktopResult<()> {
    let handle = state.daemon.handle().await?;
    let space_id = args.space_id.clone();
    let document_id = args.document_id.clone();
    handle
        .upsert_document(dt::UpsertDocumentInput {
            space_id: args.space_id,
            document_id: args.document_id,
            content_json: args.content_json,
            published: args.published,
            updated_at_ms: args.updated_at_ms.unwrap_or_else(now_ms),
        })
        .await
        .map_err(err)?;
    crate::events::publish(state, crate::events::document_changed(space_id, document_id, "documents_upsert_draft"));
    Ok(())
}

pub async fn queue_daemon_sync(state: &AppState, args: QueueDaemonSyncArgs) -> DesktopResult<()> {
    let handle = state.daemon.handle().await?;
    let space_id = args.space_id.clone();
    let document_id = args.document_id.clone();
    handle
        .upsert_document(dt::UpsertDocumentInput {
            space_id: args.space_id,
            document_id: args.document_id,
            content_json: args.content_json,
            published: args.published.unwrap_or(true),
            updated_at_ms: args.updated_at_ms,
        })
        .await
        .map_err(err)?;
    crate::events::publish(
        state,
        crate::events::document_changed(space_id, document_id, "documents_queue_daemon_sync"),
    );
    Ok(())
}

pub async fn sync_published(state: &AppState, args: SyncPublishedDocumentArgs) -> DesktopResult<SyncPublishedDocumentResult> {
    let handle = state.daemon.handle().await?;
    let space_id = args.space_id.clone();
    let document_id = args.document_id.clone();
    handle
        .upsert_document(dt::UpsertDocumentInput {
            space_id: args.space_id,
            document_id: args.document_id,
            content_json: args.content_json,
            published: true,
            updated_at_ms: args.updated_at_ms,
        })
        .await
        .map_err(err)?;
    crate::events::publish(
        state,
        crate::events::document_changed(space_id, document_id, "documents_sync_published"),
    );
    // Mirror the Electron stub: the daemon's `upsertDocument` doesn't
    // return a count, so we hard-code `1` so the renderer's "uploaded"
    // accounting stays unchanged across transports.
    Ok(SyncPublishedDocumentResult { uploaded: 1 })
}

pub async fn get_draft(state: &AppState, args: GetDraftArgs) -> DesktopResult<Option<DraftRecord>> {
    let handle = state.daemon.handle().await?;
    let record = handle.get_document(&args.space_id, &args.document_id).await.map_err(err)?;
    Ok(record.map(|r| DraftRecord {
        space_id: r.space_id,
        document_id: r.document_id,
        content_json: r.content_json,
        published: if r.published { 1 } else { 0 },
        updated_at_ms: r.updated_at_ms,
    }))
}
