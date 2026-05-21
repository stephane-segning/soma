//! Blob upload + staging routes. The Tauri shell resolves the on-disk
//! staging root via `tauri::AppHandle::path()`; the BFF receives the
//! equivalent path through the `UserDataDir` request extension wired in
//! `state::build_router`.
//!
//! Routes that carry payload bytes (`blobs_upload`, `blobs_stage`,
//! `blobs_stage_upload`, `blobs_stage_payload`) override
//! `DefaultBodyLimit` to 100 MiB so the renderer can upload images,
//! recorded audio, PDFs, etc. in a single round-trip. Routes that take a
//! path or just identifiers stay on the axum default.

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Extension, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
    routing::post,
};
use desktop_api::{AppState, blobs};
use desktop_services::upload_payload_store::StagedUpload;
use serde::Deserialize;

use crate::error::ApiError;
use crate::state::UserDataDir;

use super::BLOB_UPLOAD_MAX_BYTES;

pub(super) fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/api/v1/blobs_upload",
            post(blobs_upload).layer(DefaultBodyLimit::max(BLOB_UPLOAD_MAX_BYTES)),
        )
        .route("/api/v1/blobs_read", post(blobs_read))
        .route(
            "/api/v1/blobs_stage_upload",
            post(blobs_stage_upload).layer(DefaultBodyLimit::max(BLOB_UPLOAD_MAX_BYTES)),
        )
        .route(
            "/api/v1/blobs_stage",
            post(blobs_stage).layer(DefaultBodyLimit::max(BLOB_UPLOAD_MAX_BYTES)),
        )
        .route(
            "/api/v1/blobs_stage_payload",
            post(blobs_stage_payload).layer(DefaultBodyLimit::max(BLOB_UPLOAD_MAX_BYTES)),
        )
        .route("/api/v1/blobs_stage_from_payload", post(blobs_stage_from_payload))
}

// --- Positional-arg request bodies ------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BlobReadBody {
    space_id: String,
    cid: String,
}

// --- Handlers ---------------------------------------------------------------

async fn blobs_upload(
    State(app): State<Arc<AppState>>,
    Json(args): Json<blobs::UploadBlobArgs>,
) -> Result<Json<blobs::UploadBlobResult>, ApiError> {
    blobs::upload(&app, args).await.map(Json).map_err(ApiError::from)
}

/// Read a blob's raw bytes by `(space_id, cid)`. Returns
/// `application/octet-stream` with the payload as the body — wrapping
/// `Vec<u8>` in `Json` would serialize it as `[72, 101, ...]`, which
/// inflates the payload 3-4x and burns CPU on both ends for blobs that
/// can be up to 100 MiB. A missing blob maps to 404 with an empty body
/// (the JSON `null` shape would conflict with the octet-stream
/// content-type; callers distinguish "missing" by status, not body).
///
/// NOTE: the TS SDK's `httpTransport.invoke` currently calls
/// `res.json()` unconditionally, so the renderer cannot consume this
/// route over HTTP yet. The Tauri presenter is unaffected (it goes
/// through `tauri::command`, not the BFF). A follow-up will teach the
/// SDK to branch on `Content-Type` (or add a dedicated `fetchBytes`).
async fn blobs_read(
    State(app): State<Arc<AppState>>,
    Json(body): Json<BlobReadBody>,
) -> Result<Response, ApiError> {
    let bytes = blobs::read(&app, body.space_id, body.cid).await.map_err(ApiError::from)?;
    match bytes {
        Some(data) => Ok(([(header::CONTENT_TYPE, "application/octet-stream")], data).into_response()),
        None => Ok(StatusCode::NOT_FOUND.into_response()),
    }
}

async fn blobs_stage_upload(
    Extension(user_data_dir): Extension<UserDataDir>,
    Json(args): Json<blobs::StageUploadArgs>,
) -> Result<Json<StagedUpload>, ApiError> {
    blobs::stage_upload(user_data_dir.path().to_path_buf(), args)
        .await
        .map(Json)
        .map_err(ApiError::from)
}

async fn blobs_stage(
    State(app): State<Arc<AppState>>,
    Json(args): Json<blobs::StageBlobArgs>,
) -> Result<Json<blobs::StageBlobResult>, ApiError> {
    blobs::stage(&app, args).await.map(Json).map_err(ApiError::from)
}

/// Two-step upload's "stage to disk" leg. Same wire shape as
/// {@link blobs_stage_upload} — exposing both names keeps the SDK call
/// site stable while the renderer rolls over.
async fn blobs_stage_payload(
    Extension(user_data_dir): Extension<UserDataDir>,
    Json(args): Json<blobs::StageUploadArgs>,
) -> Result<Json<StagedUpload>, ApiError> {
    blobs::stage_upload(user_data_dir.path().to_path_buf(), args)
        .await
        .map(Json)
        .map_err(ApiError::from)
}

async fn blobs_stage_from_payload(
    State(app): State<Arc<AppState>>,
    Extension(user_data_dir): Extension<UserDataDir>,
    Json(args): Json<blobs::StageFromPayloadArgs>,
) -> Result<Json<blobs::StageBlobResult>, ApiError> {
    blobs::stage_from_payload(&app, user_data_dir.path().to_path_buf(), args)
        .await
        .map(Json)
        .map_err(ApiError::from)
}
