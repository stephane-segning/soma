//! Blob upload / read handlers. The staging API is a path on the device
//! the daemon can later read from, so it's still bound to a local
//! filesystem; the HTTP transport will translate it as a multipart
//! upload that lands in the same staging area on the server.

use std::path::PathBuf;

use desktop_core::error::{DesktopError, DesktopResult};
use desktop_services::upload_payload_store::{StagedUpload, UploadPayloadStore};
use serde::{Deserialize, Serialize};
use specta::Type;
use soma_daemon::handle_types as dt;

use crate::state::AppState;

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
