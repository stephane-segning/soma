//! Blob upload / read surface. Mirrors `controllers/blobs-controller.ts`
//! plus `command-registry/blob-handlers.ts`.

use desktop_core::error::{DesktopError, DesktopResult};
use desktop_services::upload_payload_store::{StagedUpload, UploadPayloadStore};
use serde::{Deserialize, Serialize};
use soma_daemon::handle_types as dt;
use tauri::{Manager, State};

use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadBlobArgs {
    pub space_id: String,
    #[serde(default)]
    pub doc_id: Option<String>,
    pub mime: String,
    pub name: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadBlobResult {
    pub cid: String,
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

#[derive(Debug, Deserialize)]
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

#[tauri::command]
pub async fn blobs_upload(state: State<'_, AppState>, args: UploadBlobArgs) -> DesktopResult<UploadBlobResult> {
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

#[tauri::command]
pub async fn blobs_read(state: State<'_, AppState>, space_id: String, cid: String) -> DesktopResult<Option<Vec<u8>>> {
    let handle = state.daemon.handle().await?;
    let res = handle.read_blob(&space_id, &cid).await.map_err(err)?;
    Ok(res.map(|r| r.data))
}

/// Stage a renderer-sent payload to `userData/tmp/uploads/<cuid>.bin` so the
/// documents controller can pull it on the daemon side without re-sending
/// bytes over IPC. Mirrors the staging step in the old TS controller.
#[tauri::command]
pub async fn blobs_stage_upload<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    args: StageUploadArgs,
) -> DesktopResult<StagedUpload> {
    let user_data = app
        .path()
        .app_data_dir()
        .map_err(|e| DesktopError::other(format!("app_data_dir: {e}")))?;
    let store = UploadPayloadStore::new(user_data.join("tmp").join("uploads"));
    store.stage(&args.bytes, &args.mime, args.file_name.as_deref()).await
}
