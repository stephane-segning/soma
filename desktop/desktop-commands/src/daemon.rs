//! Daemon-level commands. Mirrors `command-registry/daemon-handlers.ts`.
//!
//! Today's surface is read-only (`daemon_status` + `daemon_ready`). The
//! renderer also calls `daemon_control` to start/stop the embedded
//! runtimes; we accept the channel and forward to `DaemonRuntime`'s
//! lifecycle so the same call sites work after the cutover.

use desktop_core::error::{DesktopError, DesktopResult};
use serde::{Deserialize, Serialize};
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
    Ok(state.daemon.handle().await.is_ok())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DaemonControlArgs {
    pub action: DaemonControlAction,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DaemonControlAction {
    Start,
    Stop,
    Restart,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaemonControlResult {
    pub running: bool,
}

#[tauri::command]
pub async fn daemon_control(state: State<'_, AppState>, args: DaemonControlArgs) -> DesktopResult<DaemonControlResult> {
    let map = |e: desktop_core::error::DesktopError| -> DesktopError { e };
    let running = match args.action {
        DaemonControlAction::Start => {
            state.daemon.start().await.map_err(map)?;
            true
        }
        DaemonControlAction::Stop => {
            state.daemon.shutdown().await.map_err(map)?;
            false
        }
        DaemonControlAction::Restart => {
            state.daemon.shutdown().await.map_err(map)?;
            state.daemon.start().await.map_err(map)?;
            true
        }
    };
    Ok(DaemonControlResult { running })
}
