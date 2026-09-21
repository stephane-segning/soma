//! Process-wide handler state.
//!
//! Lives in `desktop-api` (not `desktop-commands`) so the same value can
//! back the Tauri presenter today and an HTTP presenter tomorrow. No
//! Tauri or axum types are touched here.

use std::sync::Arc;

use desktop_agent::runtime::AgentRuntime;
use desktop_agent::service::AgentService;
use desktop_agent::types::AgentRuntimeEvent;
use desktop_daemon::events::DomainEvent;
use desktop_daemon::runtime::DaemonRuntime;
use desktop_services::practice::PracticeService;
use tokio::sync::broadcast;

/// How many in-flight domain events the broadcast channel holds before
/// dropping the oldest. Same default the daemon firehose uses
/// (`subscribe_events(256)`), kept here so the renderer-side and
/// daemon-side fan-outs feel uniform.
pub const DOMAIN_EVENT_CHANNEL_CAPACITY: usize = 256;

/// Same rationale as [`DOMAIN_EVENT_CHANNEL_CAPACITY`], for the agent
/// runtime's `Ready`/`Status`/`Error` poll events.
pub const AGENT_EVENT_CHANNEL_CAPACITY: usize = 256;

pub struct AppState {
    pub daemon: Arc<DaemonRuntime>,
    pub agent_runtime: Arc<AgentRuntime>,
    pub agent: Arc<AgentService>,
    pub practice: Arc<PracticeService>,
    /// Every domain event this process knows about, from every source:
    /// renderer-triggered mutations (`desktop-api` handlers, via
    /// `events::publish`) *and* the daemon firehose (joins, bot status,
    /// blob-added — bridged in by `desktop_daemon::events::spawn`, which
    /// publishes onto this same sender rather than talking to a specific
    /// presenter directly). Each presenter (Tauri's `app.emit` forwarder,
    /// the BFF's WebSocket handler) subscribes once and forwards every
    /// event to its consumers — one pipeline, multiple presenters.
    ///
    /// `broadcast` is a multi-producer / multi-consumer channel — sends
    /// succeed even with zero subscribers (we only treat a closed channel
    /// as an error), so handlers don't need to know which shell is hosting
    /// them. See `desktop-api::events::publish` for the helper used by
    /// every handler.
    pub domain_events: broadcast::Sender<DomainEvent>,
    /// Agent runtime `Ready`/`Status`/`Error` events, bridged in by
    /// `desktop_agent::events::spawn`'s dispatch callback. Kept as a
    /// sibling channel rather than folded into `domain_events` because the
    /// payload shape (provider/model listing) doesn't fit `DomainEvent`'s
    /// variants — presenters multiplex the two on the wire instead (see
    /// `desktop-bff::ws::WsEventPayload`).
    pub agent_events: broadcast::Sender<AgentRuntimeEvent>,
}

impl AppState {
    pub fn new(
        daemon: Arc<DaemonRuntime>,
        agent_runtime: Arc<AgentRuntime>,
        agent: Arc<AgentService>,
        practice: Arc<PracticeService>,
        domain_events: broadcast::Sender<DomainEvent>,
        agent_events: broadcast::Sender<AgentRuntimeEvent>,
    ) -> Self {
        Self {
            daemon,
            agent_runtime,
            agent,
            practice,
            domain_events,
            agent_events,
        }
    }
}
