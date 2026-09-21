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
//!
//! `GET /api/v1/blobs/{space_id}/{cid}` is the one HTTP-native way to get
//! blob bytes into a browser: it streams the raw bytes with the stored
//! `Content-Type`, so it can be dropped straight into `<img src>` /
//! `<a href>` / `<video src>`. This is the transport-aware counterpart to
//! `blobs_stage`'s `soma-blob://` URL on the Tauri side — see
//! `desktop_api::blobs::BlobUrlStyle`.

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Extension, Path, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use desktop_api::{AppState, blobs};
use desktop_services::upload_payload_store::StagedUpload;
use serde::Deserialize;

use crate::auth::AuthContext;
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
        .route(
            "/api/v1/blobs_stage_from_payload",
            post(blobs_stage_from_payload),
        )
        .route("/api/v1/blobs/{space_id}/{cid}", get(blobs_get))
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
    blobs::upload(&app, args)
        .await
        .map(Json)
        .map_err(ApiError::from)
}

/// Read a blob's raw bytes by `(space_id, cid)`. Returns
/// `application/octet-stream` with the payload as the body — wrapping
/// `Vec<u8>` in `Json` would serialize it as `[72, 101, ...]`, which
/// inflates the payload 3-4x and burns CPU on both ends for blobs that
/// can be up to 100 MiB. A missing blob maps to 404 with an empty body
/// (the JSON `null` shape would conflict with the octet-stream
/// content-type; callers distinguish "missing" by status, not body).
/// This is the *correct* server-side contract for this route — it is not
/// the thing to change.
///
/// The actual mismatch is on the client side: the TS SDK's
/// `httpTransport.invoke` calls `res.json()` unconditionally, because
/// every *other* `POST /api/v1/<command>` route returns JSON — so the
/// renderer cannot consume this specific route over HTTP today (the
/// Tauri presenter is unaffected; it goes through `tauri::command`, not
/// the BFF, so `desktop-commands::blobs::blobs_read` never hits this
/// code at all). Two ways to actually use blob bytes from a browser,
/// neither of which requires changing this route:
/// 1. **Preferred for `<img>`/`<a>`/`<video>`**: `GET
///    /api/v1/blobs/{space_id}/{cid}` ([`blobs_get`], below) — a plain
///    URL with the right `Content-Type`, no `res.json()` involved.
/// 2. **For raw bytes in JS** (e.g. to build a `Blob`/object URL from a
///    `POST`-shaped call): `fetch` this route directly with
///    `Accept: application/octet-stream` and read `res.arrayBuffer()`
///    instead of going through the SDK's generic `invoke` — the SDK
///    would need a dedicated `fetchBytes`-style method to do this
///    generically, which is a `desktop-sdk` change, not a server one.
async fn blobs_read(
    State(app): State<Arc<AppState>>,
    Json(body): Json<BlobReadBody>,
) -> Result<Response, ApiError> {
    let bytes = blobs::read(&app, body.space_id, body.cid)
        .await
        .map_err(ApiError::from)?;
    match bytes {
        Some(data) => {
            Ok(([(header::CONTENT_TYPE, "application/octet-stream")], data).into_response())
        }
        None => Ok(StatusCode::NOT_FOUND.into_response()),
    }
}

async fn blobs_stage_upload(
    Extension(user_data_dir): Extension<UserDataDir>,
    Extension(auth): Extension<AuthContext>,
    Json(args): Json<blobs::StageUploadArgs>,
) -> Result<Json<StagedUpload>, ApiError> {
    blobs::stage_upload(
        user_data_dir.path().to_path_buf(),
        Some(&auth.session_scope),
        args,
    )
    .await
    .map(Json)
    .map_err(ApiError::from)
}

async fn blobs_stage(
    State(app): State<Arc<AppState>>,
    Json(args): Json<blobs::StageBlobArgs>,
) -> Result<Json<blobs::StageBlobResult>, ApiError> {
    blobs::stage(&app, args, blobs::BlobUrlStyle::Http)
        .await
        .map(Json)
        .map_err(ApiError::from)
}

/// Two-step upload's "stage to disk" leg. Same wire shape as
/// {@link blobs_stage_upload} — exposing both names keeps the SDK call
/// site stable while the renderer rolls over.
async fn blobs_stage_payload(
    Extension(user_data_dir): Extension<UserDataDir>,
    Extension(auth): Extension<AuthContext>,
    Json(args): Json<blobs::StageUploadArgs>,
) -> Result<Json<StagedUpload>, ApiError> {
    blobs::stage_upload(
        user_data_dir.path().to_path_buf(),
        Some(&auth.session_scope),
        args,
    )
    .await
    .map(Json)
    .map_err(ApiError::from)
}

async fn blobs_stage_from_payload(
    State(app): State<Arc<AppState>>,
    Extension(user_data_dir): Extension<UserDataDir>,
    Extension(auth): Extension<AuthContext>,
    Json(args): Json<blobs::StageFromPayloadArgs>,
) -> Result<Json<blobs::StageBlobResult>, ApiError> {
    blobs::stage_from_payload(
        &app,
        user_data_dir.path().to_path_buf(),
        Some(&auth.session_scope),
        args,
        blobs::BlobUrlStyle::Http,
    )
    .await
    .map(Json)
    .map_err(ApiError::from)
}

/// Stream a blob's raw bytes with its stored `Content-Type` — the one
/// HTTP-native way to get blob bytes into a browser (`<img src>`,
/// `<a href>`, `<video src>`), which cannot `POST` a JSON body first the
/// way {@link blobs_read} works. A missing blob maps to 404 with an empty
/// body, same convention as `blobs_read`.
///
/// Content-addressed and therefore immutable for a given `(space_id,
/// cid)` pair, so responses are marked cacheable indefinitely — the only
/// way the bytes at this URL change is for the URL itself to change.
///
/// Authentication note: like every route in this crate this one requires
/// the bearer token (see `auth`'s module doc), but browsers cannot attach
/// an `Authorization` header to a plain `<img src>`/`<a href>` load. This
/// route is therefore the one deliberate exception that also accepts the
/// token as a `?token=` query parameter. That reuses the same
/// full-privilege token that gates every other route (not a scoped,
/// blob-only credential), so a URL handed to this route is as sensitive
/// as the token itself — treat it accordingly (don't log full request
/// URLs at a level that leaves the query string readable). Callers that
/// want to avoid a token ever touching a URL should instead `fetch()`
/// this route with an `Authorization` header (fully supported) and turn
/// the response into an object URL for `<img src>`.
async fn blobs_get(
    State(app): State<Arc<AppState>>,
    Path((space_id, cid)): Path<(String, String)>,
) -> Result<Response, ApiError> {
    let bytes = blobs::read_with_mime(&app, space_id, cid)
        .await
        .map_err(ApiError::from)?;
    match bytes {
        Some(blob) => {
            let content_type = if blob.mime.is_empty() {
                "application/octet-stream".to_string()
            } else {
                blob.mime
            };
            Ok((
                [
                    (header::CONTENT_TYPE, content_type),
                    (
                        header::CACHE_CONTROL,
                        "public, max-age=31536000, immutable".to_string(),
                    ),
                ],
                blob.data,
            )
                .into_response())
        }
        None => Ok(StatusCode::NOT_FOUND.into_response()),
    }
}
