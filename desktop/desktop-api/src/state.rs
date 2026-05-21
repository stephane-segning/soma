//! Process-wide handler state.
//!
//! Lives in `desktop-api` (not `desktop-commands`) so the same value can
//! back the Tauri presenter today and an HTTP presenter tomorrow. No
//! Tauri or axum types are touched here.

use std::sync::Arc;

use desktop_agent::runtime::AgentRuntime;
use desktop_agent::service::AgentService;
use desktop_daemon::events::DomainEvent;
use desktop_daemon::runtime::DaemonRuntime;
use desktop_services::practice::PracticeService;
use tokio::sync::broadcast;

/// How many in-flight domain events the broadcast channel holds before
/// dropping the oldest. Same default the daemon firehose uses
/// (`subscribe_events(256)`), kept here so the renderer-side and
/// daemon-side fan-outs feel uniform.
pub const DOMAIN_EVENT_CHANNEL_CAPACITY: usize = 256;

pub struct AppState {
    pub daemon: Arc<DaemonRuntime>,
    pub agent_runtime: Arc<AgentRuntime>,
    pub agent: Arc<AgentService>,
    pub practice: Arc<PracticeService>,
    /// Renderer-source domain event fan-out. Handlers push to it; each
    /// presenter (Tauri's `app.emit`, the BFF's SSE channel) subscribes
    /// once at startup and forwards every event to its consumers.
    ///
    /// `broadcast` is a multi-producer / multi-consumer channel — sends
    /// succeed even with zero subscribers (we only treat a closed channel
    /// as an error), so handlers don't need to know which shell is hosting
    /// them. See `desktop-api::events::publish` for the helper used by
    /// every handler.
    pub domain_events: broadcast::Sender<DomainEvent>,
}

impl AppState {
    pub fn new(
        daemon: Arc<DaemonRuntime>,
        agent_runtime: Arc<AgentRuntime>,
        agent: Arc<AgentService>,
        practice: Arc<PracticeService>,
        domain_events: broadcast::Sender<DomainEvent>,
    ) -> Self {
        Self {
            daemon,
            agent_runtime,
            agent,
            practice,
            domain_events,
        }
    }
}
