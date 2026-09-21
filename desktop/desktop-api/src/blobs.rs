//! Blob upload / read handlers. The staging API is a path on the device
//! the daemon can later read from, so it's still bound to a local
//! filesystem; the HTTP transport will translate it as a multipart
//! upload that lands in the same staging area on the server.

use std::path::PathBuf;

use desktop_core::error::{DesktopError, DesktopResult};
use desktop_services::blob_processing::zip_single_file;
use desktop_services::upload_payload_store::{StagedUpload, UploadPayloadStore};
use serde::{Deserialize, Serialize};
use soma_daemon::handle_types as dt;
use specta::Type;

use crate::state::AppState;

const ZIP_MIME: &str = "application/zip";

/// Hard ceiling on a single blob's declared byte length, re-checked here
/// at ingress (the host command API — AGENTS.md's Blobs "Security and
/// limits" contract) rather than trusting the daemon's own internal cap
/// ([`soma_daemon::MAX_BLOB_BYTES`], the true source of truth) to catch
/// it eventually. Rejecting here means an oversized upload fails fast —
/// before [`stage`] spends memory zipping a non-image payload, and
/// before either presenter round-trips the whole buffer through
/// `DaemonHandle`. Both `desktop-commands` (Tauri) and `desktop-bff`
/// (HTTP) funnel through this module, so the check applies uniformly —
/// see AGENTS.md's "Presenter / transport-agnostic handler" pattern.
///
/// Kept equal to (never greater than) `soma_daemon::MAX_BLOB_BYTES`: a
/// larger value here would just be dead weight, since the daemon would
/// still reject anything past its own cap — this constant only matters
/// for how *early* the rejection happens.
pub const MAX_BLOB_UPLOAD_BYTES: usize = soma_daemon::MAX_BLOB_BYTES;

fn check_blob_size(byte_len: usize) -> DesktopResult<()> {
    if byte_len > MAX_BLOB_UPLOAD_BYTES {
        return Err(DesktopError::invalid(format!(
            "blob too large: {byte_len} bytes exceeds the {MAX_BLOB_UPLOAD_BYTES}-byte max"
        )));
    }
    Ok(())
}

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
    DesktopError::Daemon {
        message: e.to_string(),
    }
}

pub async fn upload(state: &AppState, args: UploadBlobArgs) -> DesktopResult<UploadBlobResult> {
    check_blob_size(args.bytes.len())?;
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

pub async fn read(
    state: &AppState,
    space_id: String,
    cid: String,
) -> DesktopResult<Option<Vec<u8>>> {
    let handle = state.daemon.handle().await?;
    let res = handle.read_blob(&space_id, &cid).await.map_err(err)?;
    Ok(res.map(|r| r.data))
}

/// Bytes + mime for the HTTP blob-bytes route (`GET
/// /api/v1/blobs/{space_id}/{cid}`), which needs the content type to set
/// `Content-Type` correctly for `<img src>` consumption. Kept separate
/// from [`read`] rather than changing its return shape, since `read` is
/// also the Tauri `blobs_read` command's handler and the renderer already
/// depends on that returning a bare `Option<Vec<u8>>`.
#[derive(Debug, Clone)]
pub struct BlobBytes {
    pub data: Vec<u8>,
    pub mime: String,
}

pub async fn read_with_mime(
    state: &AppState,
    space_id: String,
    cid: String,
) -> DesktopResult<Option<BlobBytes>> {
    let handle = state.daemon.handle().await?;
    let res = handle.read_blob(&space_id, &cid).await.map_err(err)?;
    Ok(res.map(|r| BlobBytes {
        data: r.data,
        mime: r.mime,
    }))
}

/// Namespaces the on-disk upload-staging directory under a
/// caller-supplied scope, e.g. `tmp/uploads/<scope>/<cuid>.bin` instead of
/// one shared `tmp/uploads/<cuid>.bin`. `None` preserves the historical
/// flat layout (the Tauri shell: a single local user, no remote
/// multi-caller concern). The BFF presenter passes `Some(session_scope)`,
/// derived from the authenticated bearer token, so concurrent callers (or
/// a future multi-token setup) never share a staging directory.
fn uploads_dir(user_data_dir: &std::path::Path, upload_scope: Option<&str>) -> PathBuf {
    let base = user_data_dir.join("tmp").join("uploads");
    match upload_scope {
        Some(scope) => base.join(scope),
        None => base,
    }
}

/// Stage a renderer-sent payload under
/// `<user_data>/tmp/uploads[/<scope>]/<cuid>.bin`. `user_data` is supplied
/// by the presenter (Tauri resolves it via `AppHandle::path()`; the BFF
/// passes the process-wide data dir plus a per-session `upload_scope`).
pub async fn stage_upload(
    user_data_dir: PathBuf,
    upload_scope: Option<&str>,
    args: StageUploadArgs,
) -> DesktopResult<StagedUpload> {
    check_blob_size(args.bytes.len())?;
    let store = UploadPayloadStore::new(uploads_dir(&user_data_dir, upload_scope));
    store
        .stage(&args.bytes, &args.mime, args.file_name.as_deref())
        .await
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

/// Where a synthesized blob URL should resolve. The *bytes* are always
/// content-addressed and daemon-owned; only the URL *scheme* is
/// transport-specific.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BlobUrlStyle {
    /// Tauri custom URI scheme, resolved in-process by
    /// `desktop-services::blob_protocol` — never valid outside this host.
    SomaBlobScheme,
    /// Path relative to the BFF's own origin, served by the authenticated
    /// `GET /api/v1/blobs/{space_id}/{cid}` route. The caller (renderer)
    /// resolves it against whatever origin it loaded the SDK from.
    Http,
}

fn synth_blob_url(style: BlobUrlStyle, space_id: &str, cid: &str) -> String {
    match style {
        BlobUrlStyle::SomaBlobScheme => format!("soma-blob://daemon/{space_id}/{cid}"),
        BlobUrlStyle::Http => format!("/api/v1/blobs/{space_id}/{cid}"),
    }
}

/// Mime-aware blob staging. Images pass through verbatim; non-image
/// payloads are zipped first and uploaded as `application/zip`. The result
/// carries a synthesized URL (shape controlled by `url_style`) the
/// renderer can hand straight to `<img>` / `<a>` tags.
pub async fn stage(
    state: &AppState,
    args: StageBlobArgs,
    url_style: BlobUrlStyle,
) -> DesktopResult<StageBlobResult> {
    check_blob_size(args.bytes.len())?;
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

    let url = synth_blob_url(url_style, &space_id, &res.cid);
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
    upload_scope: Option<&str>,
    args: StageFromPayloadArgs,
    url_style: BlobUrlStyle,
) -> DesktopResult<StageBlobResult> {
    let store = UploadPayloadStore::new(uploads_dir(&user_data_dir, upload_scope));
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
        url_style,
    )
    .await?;
    store.remove(&args.payload_path).await?;
    Ok(result)
}
