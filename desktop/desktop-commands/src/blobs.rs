//! Tauri presenter for `desktop_api::blobs::*`. Resolves the platform
//! user-data dir for the staging upload before calling the pure handler.

use desktop_api::{
    AppState,
    blobs::{
        self as api, StageBlobArgs, StageBlobResult, StageFromPayloadArgs, StageUploadArgs, UploadBlobArgs,
        UploadBlobResult,
    },
};
use desktop_core::error::{DesktopError, DesktopResult};
use desktop_services::upload_payload_store::StagedUpload;
use tauri::{Manager, State};

fn resolve_user_data_dir(app: &tauri::AppHandle) -> DesktopResult<std::path::PathBuf> {
    app.path()
        .app_data_dir()
        .map_err(|e| DesktopError::other(format!("app_data_dir: {e}")))
}

#[tauri::command]
#[specta::specta]
pub async fn blobs_upload(state: State<'_, AppState>, args: UploadBlobArgs) -> DesktopResult<UploadBlobResult> {
    api::upload(state.inner(), args).await
}

#[tauri::command]
#[specta::specta]
pub async fn blobs_read(state: State<'_, AppState>, space_id: String, cid: String) -> DesktopResult<Option<Vec<u8>>> {
    api::read(state.inner(), space_id, cid).await
}

#[tauri::command]
#[specta::specta]
pub async fn blobs_stage_upload(
    app: tauri::AppHandle,
    args: StageUploadArgs,
) -> DesktopResult<StagedUpload> {
    let user_data_dir = resolve_user_data_dir(&app)?;
    api::stage_upload(user_data_dir, args).await
}

/// Mime-aware stage: image payloads pass through verbatim, anything else
/// gets zipped before hitting the daemon. Returns the daemon's
/// `cid`/`size`/`mime`/`name` plus the synthesized `soma-blob://` URL.
#[tauri::command]
#[specta::specta]
pub async fn blobs_stage(state: State<'_, AppState>, args: StageBlobArgs) -> DesktopResult<StageBlobResult> {
    api::stage(state.inner(), args).await
}

/// Two-step upload's "stage to disk" leg. The wire shape matches
/// {@link blobs_stage_upload} — exposing it under the renderer-expected
/// command name keeps the SDK call site stable across shells.
#[tauri::command]
#[specta::specta]
pub async fn blobs_stage_payload(
    app: tauri::AppHandle,
    args: StageUploadArgs,
) -> DesktopResult<StagedUpload> {
    let user_data_dir = resolve_user_data_dir(&app)?;
    api::stage_upload(user_data_dir, args).await
}

/// Two-step upload's "consume staged payload" leg. Reads the staged file,
/// hands it to the mime-aware [`blobs_stage`] handler, then removes the
/// staging file on success.
#[tauri::command]
#[specta::specta]
pub async fn blobs_stage_from_payload(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    args: StageFromPayloadArgs,
) -> DesktopResult<StageBlobResult> {
    let user_data_dir = resolve_user_data_dir(&app)?;
    api::stage_from_payload(state.inner(), user_data_dir, args).await
}
