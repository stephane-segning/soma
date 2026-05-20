//! Process-wide handler state.
//!
//! Lives in `desktop-api` (not `desktop-commands`) so the same value can
//! back the Tauri presenter today and an HTTP presenter tomorrow. No
//! Tauri or axum types are touched here.

use std::sync::Arc;

use desktop_agent::runtime::AgentRuntime;
use desktop_agent::service::AgentService;
use desktop_daemon::runtime::DaemonRuntime;

pub struct AppState {
    pub daemon: Arc<DaemonRuntime>,
    pub agent_runtime: Arc<AgentRuntime>,
    pub agent: Arc<AgentService>,
}

impl AppState {
    pub fn new(daemon: Arc<DaemonRuntime>, agent_runtime: Arc<AgentRuntime>, agent: Arc<AgentService>) -> Self {
        Self {
            daemon,
            agent_runtime,
            agent,
        }
    }
}
