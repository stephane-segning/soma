//! Daemon status + lifecycle.

use desktop_core::error::DesktopResult;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::state::AppState;

/// Socket-introspection details. The Tauri shell embeds the daemon
/// in-process, so the renderer-facing socket card has nothing to inspect
/// and these fields stay `None`. The Electron shell populates them from
/// the on-disk Unix socket. Kept here so the SDK type carries the
/// richer shape both shells share.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DaemonSocketInfo {
    pub exists: bool,
    pub uid: Option<u32>,
    pub gid: Option<u32>,
    pub mode: Option<u32>,
    pub owned_by_current_user: Option<bool>,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DaemonStatus {
    /// `true` when the renderer can talk to the runtime. Always `true`
    /// on the Tauri side once `state.daemon.handle()` succeeds.
    pub reachable: bool,
    /// Identifier for the daemon transport. `<embedded:tauri>` on the
    /// Tauri shell; the Unix socket path on the Electron shell.
    pub socket_path: String,
    pub peer_id: Option<String>,
    pub listen_addrs: Vec<String>,
    /// Populated when `status()` failed to talk to the runtime.
    pub error: Option<String>,
    pub socket: Option<DaemonSocketInfo>,
}

const EMBEDDED_SOCKET_PATH: &str = "<embedded:tauri>";

pub async fn status(state: &AppState) -> DesktopResult<DaemonStatus> {
    // Both shells contract for a *structured* "unavailable" snapshot
    // rather than an error result — see the Electron handler which
    // returns `{ reachable: false, error: "..." }` instead of throwing.
    // The renderer settings panel keys off `reachable` + `error`, so a
    // rejection here would drop the UI to a null state and silently
    // diverge from the Electron path (this was the cross-shell parity
    // gap flagged by review on PR #115).
    match state.daemon.handle().await {
        Ok(handle) => {
            let s = handle.status().await;
            Ok(DaemonStatus {
                reachable: true,
                socket_path: EMBEDDED_SOCKET_PATH.to_string(),
                peer_id: Some(s.peer_id),
                listen_addrs: s.listen_addrs,
                error: None,
                socket: Some(DaemonSocketInfo {
                    exists: true,
                    uid: None,
                    gid: None,
                    mode: None,
                    owned_by_current_user: Some(true),
                }),
            })
        }
        Err(err) => Ok(DaemonStatus {
            reachable: false,
            socket_path: EMBEDDED_SOCKET_PATH.to_string(),
            peer_id: None,
            listen_addrs: Vec::new(),
            error: Some(err.to_string()),
            socket: None,
        }),
    }
}

pub async fn ready(state: &AppState) -> DesktopResult<bool> {
    Ok(state.daemon.handle().await.is_ok())
}

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ControlArgs {
    pub action: ControlAction,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum ControlAction {
    Start,
    Stop,
    Restart,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ControlResult {
    /// `true` when the lifecycle action completed successfully. Any
    /// underlying start/stop failure short-circuits via `?` before we
    /// reach the result construction, so by the time this is built the
    /// action has succeeded — even for `Stop`, where the post-action
    /// runtime is intentionally unreachable. Mirrors the Electron-side
    /// `ok` boolean.
    pub ok: bool,
    pub action: ControlAction,
    /// Status snapshot taken right after the action ran, so renderer
    /// consumers don't need a follow-up `status()` round-trip.
    pub status: DaemonStatus,
    /// Optional human-readable note. `None` on success.
    pub message: Option<String>,
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
    let snapshot = if running {
        status(state).await?
    } else {
        DaemonStatus {
            reachable: false,
            socket_path: EMBEDDED_SOCKET_PATH.to_string(),
            peer_id: None,
            listen_addrs: Vec::new(),
            error: None,
            socket: None,
        }
    };
    Ok(ControlResult {
        // Any failure in the lifecycle calls above propagates via `?`,
        // so reaching this point means the requested action succeeded —
        // including `Stop`, where the post-action runtime is *expected*
        // to be unreachable. Tying `ok` to `running` mis-reports a
        // successful stop as a failure in the renderer.
        ok: true,
        action: args.action,
        status: snapshot,
        message: None,
    })
}
