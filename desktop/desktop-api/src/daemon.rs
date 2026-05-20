//! Daemon status + lifecycle.

use desktop_core::error::DesktopResult;
use serde::{Deserialize, Serialize};

use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaemonStatus {
    pub peer_id: String,
    pub listen_addrs: Vec<String>,
}

pub async fn status(state: &AppState) -> DesktopResult<DaemonStatus> {
    let handle = state.daemon.handle().await?;
    let s = handle.status().await;
    Ok(DaemonStatus {
        peer_id: s.peer_id,
        listen_addrs: s.listen_addrs,
    })
}

pub async fn ready(state: &AppState) -> DesktopResult<bool> {
    Ok(state.daemon.handle().await.is_ok())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ControlArgs {
    pub action: ControlAction,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ControlAction {
    Start,
    Stop,
    Restart,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ControlResult {
    pub running: bool,
}

pub async fn control(state: &AppState, args: ControlArgs) -> DesktopResult<ControlResult> {
    let running = match args.action {
        ControlAction::Start => {
            state.daemon.start().await?;
            true
        }
        ControlAction::Stop => {
            state.daemon.shutdown().await?;
            false
        }
        ControlAction::Restart => {
            state.daemon.shutdown().await?;
            state.daemon.start().await?;
            true
        }
    };
    Ok(ControlResult { running })
}
