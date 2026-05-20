//! Misc daemon-level commands. Mirrors `command-registry/daemon-handlers.ts`.

use desktop_core::error::{DesktopError, DesktopResult};
use serde::Serialize;
use tauri::State;

use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaemonStatus {
    pub peer_id: String,
    pub listen_addrs: Vec<String>,
}

#[tauri::command]
pub async fn daemon_status(state: State<'_, AppState>) -> DesktopResult<DaemonStatus> {
    let handle = state.daemon.handle().await?;
    let status = handle.status().await;
    Ok(DaemonStatus {
        peer_id: status.peer_id,
        listen_addrs: status.listen_addrs,
    })
}

#[tauri::command]
pub async fn daemon_ready(state: State<'_, AppState>) -> DesktopResult<bool> {
    state.daemon.handle().await.map(|_| true).or(Ok(false))
}

// Helper to satisfy DesktopError; ensures the result path compiles if we ever
// switch from `Or(Ok(false))` to a proper error map.
#[allow(dead_code)]
fn _err(e: impl std::fmt::Display) -> DesktopError {
    DesktopError::Daemon { message: e.to_string() }
}
