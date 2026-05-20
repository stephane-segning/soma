//! Shared Tauri state surface for the desktop commands. The binary owns the
//! actual `AppState` (see `desktop-app/src-tauri/src/lib.rs`); each command
//! reaches in through `tauri::State<AppState>`.
//!
//! Kept in its own module so the trait is testable without dragging the
//! Tauri Builder into unit tests.

use std::sync::Arc;

use desktop_agent::runtime::AgentRuntime;
use desktop_daemon::runtime::DaemonRuntime;

pub struct AppState {
    pub daemon: Arc<DaemonRuntime>,
    pub agent: Arc<AgentRuntime>,
}

impl AppState {
    pub fn new(daemon: Arc<DaemonRuntime>, agent: Arc<AgentRuntime>) -> Self {
        Self { daemon, agent }
    }
}
