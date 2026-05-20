//! Tauri presenter for `desktop_api::daemon::*`.

use desktop_api::{
    AppState,
    daemon::{self as api, ControlArgs, ControlResult, DaemonStatus},
};
use desktop_core::error::DesktopResult;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn daemon_status(state: State<'_, AppState>) -> DesktopResult<DaemonStatus> {
    api::status(state.inner()).await
}

#[tauri::command]
#[specta::specta]
pub async fn daemon_ready(state: State<'_, AppState>) -> DesktopResult<bool> {
    api::ready(state.inner()).await
}

#[tauri::command]
#[specta::specta]
pub async fn daemon_control(state: State<'_, AppState>, args: ControlArgs) -> DesktopResult<ControlResult> {
    api::control(state.inner(), args).await
}
