//! Blob upload / read handlers. The staging API is a path on the device
//! the daemon can later read from, so it's still bound to a local
//! filesystem; the HTTP transport will translate it as a multipart
//! upload that lands in the same staging area on the server.

use std::path::PathBuf;

use desktop_core::error::{DesktopError, DesktopResult};
use desktop_services::blob_processing::zip_single_file;
use desktop_services::upload_payload_store::{StagedUpload, UploadPayloadStore};
use serde::{Deserialize, Serialize};
use specta::Type;
use soma_daemon::handle_types as dt;

use crate::state::AppState;

const ZIP_MIME: &str = "application/zip";

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UploadBlobArgs {
    pub space_id: String,
    #[serde(default)]
    pub doc_id: Option<String>,
    pub mime: String,
    pub name: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UploadBlobResult {
    pub cid: String,
    #[specta(type = i32)]
    pub size: u64,
    pub mime: String,
    pub name: String,
}

impl From<dt::UploadBlobResult> for UploadBlobResult {
    fn from(r: dt::UploadBlobResult) -> Self {
        Self {
            cid: r.cid,
            size: r.size,
            mime: r.mime,
            name: r.name,
        }
    }
}

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StageUploadArgs {
    pub bytes: Vec<u8>,
    pub mime: String,
    #[serde(default)]
    pub file_name: Option<String>,
}

fn err(e: impl std::fmt::Display) -> DesktopError {
    DesktopError::Daemon { message: e.to_string() }
}

pub async fn upload(state: &AppState, args: UploadBlobArgs) -> DesktopResult<UploadBlobResult> {
    let handle = state.daemon.handle().await?;
    let res = handle
        .upload_blob(dt::UploadBlobInput {
            space_id: args.space_id,
            data: args.bytes,
            mime: args.mime,
            name: args.name,
            doc_id: args.doc_id.unwrap_or_default(),
        })
        .await
        .map_err(err)?;
    Ok(res.into())
}

pub async fn read(state: &AppState, space_id: String, cid: String) -> DesktopResult<Option<Vec<u8>>> {
    let handle = state.daemon.handle().await?;
    let res = handle.read_blob(&space_id, &cid).await.map_err(err)?;
    Ok(res.map(|r| r.data))
}

/// Stage a renderer-sent payload under `<user_data>/tmp/uploads/<cuid>.bin`.
/// `user_data` is supplied by the presenter (Tauri resolves it via
/// `AppHandle::path()`; the HTTP route will pass an injected per-tenant
/// upload dir).
pub async fn stage_upload(user_data_dir: PathBuf, args: StageUploadArgs) -> DesktopResult<StagedUpload> {
    let store = UploadPayloadStore::new(user_data_dir.join("tmp").join("uploads"));
    store.stage(&args.bytes, &args.mime, args.file_name.as_deref()).await
}

/// Args for the mime-aware {@link stage} handler. Mirrors the renderer's
/// `BlobStageParams` shape: image payloads pass through verbatim, anything
/// else is zipped before hitting the daemon.
#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StageBlobArgs {
    pub space_id: String,
    #[serde(default)]
    pub doc_id: Option<String>,
    pub bytes: Vec<u8>,
    pub mime: String,
    #[serde(default)]
    pub file_name: Option<String>,
}

/// Thumbnail/variant descriptor. The Electron handler does not populate
/// these yet — the field exists so the SDK type can carry future variants
/// without a schema change.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StageBlobVariant {
    pub cid: String,
    #[specta(type = i32)]
    pub size: u64,
    pub mime: String,
    pub name: String,
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StageBlobResult {
    pub cid: String,
    #[specta(type = i32)]
    pub size: u64,
    pub mime: String,
    pub name: String,
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub variants: Option<Vec<StageBlobVariant>>,
}

/// Args for the "consume a previously-staged payload and stage it as a
/// blob" handler. Mirrors the renderer's `BlobStageFromPayloadParams`.
#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StageFromPayloadArgs {
    pub space_id: String,
    #[serde(default)]
    pub doc_id: Option<String>,
    pub payload_path: PathBuf,
    pub mime: String,
    #[serde(default)]
    pub file_name: Option<String>,
}

fn synth_blob_url(space_id: &str, cid: &str) -> String {
    format!("soma-blob://daemon/{space_id}/{cid}")
}

/// Mime-aware blob staging. Images pass through verbatim; non-image
/// payloads are zipped first and uploaded as `application/zip`. The result
/// carries a synthesized `soma-blob://daemon/<space>/<cid>` URL the
/// renderer can hand straight to `<img>` / `<a>` tags.
pub async fn stage(state: &AppState, args: StageBlobArgs) -> DesktopResult<StageBlobResult> {
    let handle = state.daemon.handle().await?;
    let space_id = args.space_id;
    let doc_id = args.doc_id.unwrap_or_default();

    let (bytes, mime, name) = if args.mime.starts_with("image/") {
        let name = args.file_name.unwrap_or_else(|| "image".to_string());
        (args.bytes, args.mime, name)
    } else {
        let original = args.file_name.unwrap_or_else(|| "file".to_string());
        let zipped = zip_single_file(&original, &args.bytes)?;
        (zipped.data, ZIP_MIME.to_string(), zipped.name)
    };

    let res = handle
        .upload_blob(dt::UploadBlobInput {
            space_id: space_id.clone(),
            data: bytes,
            mime,
            name,
            doc_id,
        })
        .await
        .map_err(err)?;

    let url = synth_blob_url(&space_id, &res.cid);
    Ok(StageBlobResult {
        cid: res.cid,
        size: res.size,
        mime: res.mime,
        name: res.name,
        url,
        variants: None,
    })
}

/// Consume a previously staged upload payload: read its bytes off disk,
/// run the mime-aware stage handler, then remove the staged file. The
/// payload dir is resolved the same way as [`stage_upload`].
pub async fn stage_from_payload(
    state: &AppState,
    user_data_dir: PathBuf,
    args: StageFromPayloadArgs,
) -> DesktopResult<StageBlobResult> {
    let store = UploadPayloadStore::new(user_data_dir.join("tmp").join("uploads"));
    let bytes = store.read(&args.payload_path).await?;
    let result = stage(
        state,
        StageBlobArgs {
            space_id: args.space_id,
            doc_id: args.doc_id,
            bytes,
            mime: args.mime,
            file_name: args.file_name,
        },
    )
    .await?;
    store.remove(&args.payload_path).await?;
    Ok(result)
}
