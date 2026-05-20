//! Document + page handlers. Wall-clock timestamps are filled in for
//! arguments that omit them so the renderer doesn't have to send them on
//! every call.

use desktop_core::error::{DesktopError, DesktopResult};
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

// --- Handlers ----------------------------------------------------------------

fn err(e: impl std::fmt::Display) -> DesktopError {
    DesktopError::Daemon { message: e.to_string() }
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
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
