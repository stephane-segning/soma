//! Documents + pages routes. Mirrors `desktop_commands::documents::*`.
//! Includes the draft surface (`documents_get_draft`,
//! `documents_upsert_draft`, …) — every mutating handler in
//! `desktop_api::documents::*` already emits the
//! renderer-source `document-changed` event itself, so these adapters
//! stay one-liners.

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State,
    routing::post,
};
use desktop_api::{AppState, documents};
use serde::Deserialize;

use crate::error::ApiError;

pub(super) fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v1/documents_upsert", post(documents_upsert))
        .route("/api/v1/documents_get", post(documents_get))
        .route("/api/v1/documents_ensure_page", post(documents_ensure_page))
        .route("/api/v1/documents_list_pages", post(documents_list_pages))
        .route(
            "/api/v1/documents_update_page_title",
            post(documents_update_page_title),
        )
        .route(
            "/api/v1/documents_set_page_parents",
            post(documents_set_page_parents),
        )
        .route("/api/v1/documents_get_draft", post(documents_get_draft))
        .route("/api/v1/documents_upsert_draft", post(documents_upsert_draft))
        .route(
            "/api/v1/documents_queue_daemon_sync",
            post(documents_queue_daemon_sync),
        )
        .route("/api/v1/documents_sync_published", post(documents_sync_published))
}

// --- Positional-arg request bodies ------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DocumentGetBody {
    space_id: String,
    document_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpaceIdBody {
    space_id: String,
}

// --- Handlers ---------------------------------------------------------------

async fn documents_upsert(
    State(app): State<Arc<AppState>>,
    Json(args): Json<documents::UpsertDocumentArgs>,
) -> Result<Json<()>, ApiError> {
    documents::upsert(&app, args).await.map(Json).map_err(ApiError::from)
}

async fn documents_get(
    State(app): State<Arc<AppState>>,
    Json(body): Json<DocumentGetBody>,
) -> Result<Json<Option<documents::StoredDocument>>, ApiError> {
    documents::get(&app, body.space_id, body.document_id)
        .await
        .map(Json)
        .map_err(ApiError::from)
}

async fn documents_ensure_page(
    State(app): State<Arc<AppState>>,
    Json(args): Json<documents::EnsurePageArgs>,
) -> Result<Json<documents::StoredPage>, ApiError> {
    documents::ensure_page(&app, args).await.map(Json).map_err(ApiError::from)
}

async fn documents_list_pages(
    State(app): State<Arc<AppState>>,
    Json(body): Json<SpaceIdBody>,
) -> Result<Json<Vec<documents::StoredPage>>, ApiError> {
    documents::list_pages(&app, body.space_id)
        .await
        .map(Json)
        .map_err(ApiError::from)
}

async fn documents_update_page_title(
    State(app): State<Arc<AppState>>,
    Json(args): Json<documents::UpdatePageTitleArgs>,
) -> Result<Json<Option<documents::StoredPage>>, ApiError> {
    documents::update_page_title(&app, args)
        .await
        .map(Json)
        .map_err(ApiError::from)
}

async fn documents_set_page_parents(
    State(app): State<Arc<AppState>>,
    Json(args): Json<documents::SetPageParentsArgs>,
) -> Result<Json<Option<documents::StoredPage>>, ApiError> {
    documents::set_page_parents(&app, args)
        .await
        .map(Json)
        .map_err(ApiError::from)
}

async fn documents_get_draft(
    State(app): State<Arc<AppState>>,
    Json(args): Json<documents::GetDraftArgs>,
) -> Result<Json<Option<documents::DraftRecord>>, ApiError> {
    documents::get_draft(&app, args).await.map(Json).map_err(ApiError::from)
}

async fn documents_upsert_draft(
    State(app): State<Arc<AppState>>,
    Json(args): Json<documents::UpsertDraftArgs>,
) -> Result<Json<()>, ApiError> {
    documents::upsert_draft(&app, args).await.map(Json).map_err(ApiError::from)
}

async fn documents_queue_daemon_sync(
    State(app): State<Arc<AppState>>,
    Json(args): Json<documents::QueueDaemonSyncArgs>,
) -> Result<Json<()>, ApiError> {
    documents::queue_daemon_sync(&app, args)
        .await
        .map(Json)
        .map_err(ApiError::from)
}

async fn documents_sync_published(
    State(app): State<Arc<AppState>>,
    Json(args): Json<documents::SyncPublishedDocumentArgs>,
) -> Result<Json<documents::SyncPublishedDocumentResult>, ApiError> {
    documents::sync_published(&app, args)
        .await
        .map(Json)
        .map_err(ApiError::from)
}
