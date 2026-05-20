//! Window-level event fan-out, replaces `domain-events.ts` + `agent-events.ts`.
//!
//! In Electron we used `BrowserWindow.getAllWindows()` then
//! `webContents.send(channel, payload)`. Tauri V2's `Emitter::emit` already
//! fans out to every webview, so each broadcaster is a one-liner.
//!
//! Payloads are owned by the daemon/agent crates — we accept any
//! `serde::Serialize` here so this module can be compiled without pulling in
//! either runtime.

use desktop_core::error::{DesktopError, DesktopResult};
use desktop_core::events::{AGENT_EVENT, DOMAIN_EVENT};
use serde::Serialize;
use tauri::{Emitter, Runtime};

pub struct DomainEventsBroadcaster;

impl DomainEventsBroadcaster {
    pub fn broadcast<R: Runtime, T: Serialize + Clone, M: tauri::Manager<R> + Emitter<R>>(
        app: &M,
        event: &T,
    ) -> DesktopResult<()> {
        app.emit(DOMAIN_EVENT, event)
            .map_err(|e| DesktopError::other(format!("emit domain event: {e}")))
    }
}

pub struct AgentEventsBroadcaster;

impl AgentEventsBroadcaster {
    pub fn broadcast<R: Runtime, T: Serialize + Clone, M: tauri::Manager<R> + Emitter<R>>(
        app: &M,
        event: &T,
    ) -> DesktopResult<()> {
        app.emit(AGENT_EVENT, event)
            .map_err(|e| DesktopError::other(format!("emit agent event: {e}")))
    }
}
