//! Tauri presenter for `desktop_api::blobs::*`. Resolves the platform
//! user-data dir for the staging upload before calling the pure handler.

use desktop_api::{
    AppState,
    blobs::{self as api, StageUploadArgs, UploadBlobArgs, UploadBlobResult},
};
use desktop_core::error::{DesktopError, DesktopResult};
use desktop_services::upload_payload_store::StagedUpload;
use tauri::{Manager, State};

#[tauri::command]
pub async fn blobs_upload(state: State<'_, AppState>, args: UploadBlobArgs) -> DesktopResult<UploadBlobResult> {
    api::upload(state.inner(), args).await
}

#[tauri::command]
pub async fn blobs_read(state: State<'_, AppState>, space_id: String, cid: String) -> DesktopResult<Option<Vec<u8>>> {
    api::read(state.inner(), space_id, cid).await
}

#[tauri::command]
pub async fn blobs_stage_upload<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    args: StageUploadArgs,
) -> DesktopResult<StagedUpload> {
    let user_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| DesktopError::other(format!("app_data_dir: {e}")))?;
    api::stage_upload(user_data_dir, args).await
}
