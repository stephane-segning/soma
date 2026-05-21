//! Route registration. Each `POST /api/v1/<command>` handler is a one-line
//! adapter that defers to `desktop_api::*`. Adding a new command means
//! lifting the matching `#[tauri::command]` from `desktop-commands` into a
//! parallel `axum`-flavored shim here.
//!
//! This PR ships the *representative slice* (spaces / documents / daemon /
//! blobs) so the SDK's `httpTransport` end-to-end path can be exercised
//! against a real backend. The rest of the routes follow in a later PR.

use std::sync::Arc;

use axum::{Json, Router, extract::State, routing::{get, post}};
use desktop_api::AppState;
use desktop_api::{blobs, daemon, documents, spaces};

use crate::error::ApiError;
use crate::sse;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v1/spaces_list", post(spaces_list))
        .route("/api/v1/documents_get_draft", post(documents_get_draft))
        .route("/api/v1/documents_upsert_draft", post(documents_upsert_draft))
        .route("/api/v1/daemon_status", post(daemon_status))
        .route("/api/v1/blobs_upload", post(blobs_upload))
        .route("/api/v1/events", get(sse::events_sse))
}

// --- spaces -----------------------------------------------------------------

async fn spaces_list(
    State(app): State<Arc<AppState>>,
    Json(args): Json<spaces::ListSpacesArgs>,
) -> Result<Json<spaces::ListSpacesResult>, ApiError> {
    spaces::list(&app, args).await.map(Json).map_err(ApiError::from)
}

// --- documents --------------------------------------------------------------

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

// --- daemon -----------------------------------------------------------------

/// `POST /api/v1/daemon_status` accepts an empty body — the handler takes
/// no arguments. We don't deserialize anything from the request to keep
/// the SDK call (which sends `{}` as args) happy without forcing it to
/// invent a non-args struct on the Rust side.
async fn daemon_status(
    State(app): State<Arc<AppState>>,
) -> Result<Json<daemon::DaemonStatus>, ApiError> {
    daemon::status(&app).await.map(Json).map_err(ApiError::from)
}

// --- blobs ------------------------------------------------------------------

async fn blobs_upload(
    State(app): State<Arc<AppState>>,
    Json(args): Json<blobs::UploadBlobArgs>,
) -> Result<Json<blobs::UploadBlobResult>, ApiError> {
    blobs::upload(&app, args).await.map(Json).map_err(ApiError::from)
}
