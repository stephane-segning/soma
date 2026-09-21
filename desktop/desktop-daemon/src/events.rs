//! Bridge from `soma_daemon::DaemonHandle::subscribe_events` to the shared
//! renderer-facing domain-event channel (`AppState::domain_events`).
//! Mirrors `desktop/soma/src/main/services/startup-service/daemon-events.ts`.
//!
//! The bridge is a single spawned `tokio` task. It owns the mpsc receiver
//! the daemon hands out; dropping the bridge stops translation (the daemon
//! task ends on its own when the receiver drops).
//!
//! Deliberately transport-agnostic: this crate is linked into both the
//! Tauri shell and the standalone `desktop-bff` binary, so it must not
//! depend on `tauri`. The bridge publishes onto a plain
//! `tokio::sync::broadcast::Sender<DomainEvent>` — the same channel
//! `desktop-api` handlers publish renderer-sourced events onto — so every
//! presenter (Tauri's `app.emit` forwarder, the BFF's WebSocket handler)
//! drains one unified stream instead of each shell wiring its own copy of
//! "what counts as a domain event." See AGENTS.md's "one event pipeline,
//! two presenters" note under Crash isolation & supervision / Desktop Host.

use serde::Serialize;
use soma_daemon::DaemonHandle;
use soma_daemon::handle_types::DaemonEventRecord;
use specta::Type;
use tokio::sync::broadcast;
use tokio::task::JoinHandle;

/// Source tag for renderer-broadcast events.
///
/// `Daemon` is reserved for events that originate from the daemon
/// firehose; today every variant in `DomainEvent` that uses this tag is
/// emitted with `Renderer` from a command handler.
#[derive(Debug, Clone, Copy, Serialize, Type)]
#[serde(rename_all = "kebab-case")]
pub enum DomainEventSource {
    Renderer,
    Daemon,
}

/// Renderer-facing payload. Tagged on `kind` so the renderer can
/// discriminate each variant when consuming the `domain_event` channel.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum DomainEvent {
    #[serde(rename_all = "camelCase")]
    DocumentBlobAdded {
        space_id: String,
        doc_id: String,
        cid: String,
        mime: String,
        #[specta(type = i32)]
        size: i64,
        name: String,
    },
    #[serde(rename_all = "camelCase")]
    JoinSubmitted { request_id: String, target_peer_id: String },
    #[serde(rename_all = "camelCase")]
    JoinDecision {
        from_peer_id: String,
        space_id: String,
        decision: i32,
        reason: String,
    },
    #[serde(rename_all = "camelCase")]
    JoinFailed { target_peer_id: String, error: String },
    #[serde(rename_all = "camelCase")]
    BotStatusChanged {
        space_id: String,
        delegate_peer_id: String,
        status: String,
    },
    /// Renderer-broadcast: emitted by document/page command handlers
    /// when something changed at the page-list level for a space.
    #[serde(rename_all = "camelCase")]
    PagesChanged {
        source: DomainEventSource,
        #[specta(type = i32)]
        at_ms: i64,
        space_id: String,
        reason: Option<String>,
    },
    /// Renderer-broadcast: emitted by document command handlers when a
    /// specific document's contents changed.
    #[serde(rename_all = "camelCase")]
    DocumentChanged {
        source: DomainEventSource,
        #[specta(type = i32)]
        at_ms: i64,
        space_id: String,
        document_id: String,
        reason: Option<String>,
    },
}

impl From<DaemonEventRecord> for DomainEvent {
    fn from(r: DaemonEventRecord) -> Self {
        match r {
            DaemonEventRecord::DocumentBlobAdded {
                space_id,
                doc_id,
                cid,
                mime,
                size,
                name,
            } => DomainEvent::DocumentBlobAdded {
                space_id,
                doc_id,
                cid,
                mime,
                size,
                name,
            },
            DaemonEventRecord::JoinSubmitted {
                request_id,
                target_peer_id,
            } => DomainEvent::JoinSubmitted { request_id, target_peer_id },
            DaemonEventRecord::JoinDecision {
                from_peer_id,
                space_id,
                decision,
                reason,
            } => DomainEvent::JoinDecision {
                from_peer_id,
                space_id,
                decision,
                reason,
            },
            DaemonEventRecord::JoinFailed {
                target_peer_id,
                error,
            } => DomainEvent::JoinFailed { target_peer_id, error },
            DaemonEventRecord::BotStatusChanged {
                space_id,
                delegate_peer_id,
                status,
            } => DomainEvent::BotStatusChanged {
                space_id,
                delegate_peer_id,
                status,
            },
            // The first genuinely daemon-sourced `DocumentChanged`: a
            // peer's version of this document was accepted into local
            // storage, so any open editor is now looking at stale text.
            // `reason` is what lets the renderer tell this apart from
            // its own write echoing back.
            DaemonEventRecord::DocumentReplicated {
                space_id,
                document_id,
                from_peer_id,
            } => DomainEvent::DocumentChanged {
                source: DomainEventSource::Daemon,
                at_ms: desktop_core::time::now_ms(),
                space_id,
                document_id,
                reason: Some(format!("replicated from {from_peer_id}")),
            },
        }
    }
}

/// Handle returned by [`spawn`]; dropping the handle aborts the bridge.
pub struct EventBridge {
    task: JoinHandle<()>,
}

impl EventBridge {
    pub fn stop(self) {
        self.task.abort();
    }
}

impl Drop for EventBridge {
    fn drop(&mut self) {
        self.task.abort();
    }
}

/// Subscribe to `daemon`'s event firehose and re-publish each event onto
/// `domain_events`. Mirrors the `DaemonEventStreamBridge.start()` flow in
/// the old Electron startup service, generalized to any presenter: the
/// Tauri shell forwards the same channel into `app.emit`, the BFF forwards
/// it into the WebSocket stream.
///
/// Buffer is forwarded to `DaemonHandle::subscribe_events`; 256 is the same
/// default the napi addon used.
///
/// Soft-fails like `desktop_api::events::publish`: a `send` error only
/// means the channel is closed (shutting down) or has no subscribers yet,
/// neither of which should kill the bridge task.
pub fn spawn(domain_events: broadcast::Sender<DomainEvent>, daemon: DaemonHandle, buffer: usize) -> EventBridge {
    let mut rx = daemon.subscribe_events(buffer);
    let task = tokio::spawn(async move {
        while let Some(record) = rx.recv().await {
            // A replicated document carries its page row with it, so the
            // page list changed too. `From` can only produce one event,
            // and the pages panel listens for its own — without this the
            // document arrives but never appears in the sidebar until
            // the next manual refresh.
            let also_pages = match &record {
                DaemonEventRecord::DocumentReplicated { space_id, .. } => {
                    Some(DomainEvent::PagesChanged {
                        source: DomainEventSource::Daemon,
                        at_ms: desktop_core::time::now_ms(),
                        space_id: space_id.clone(),
                        reason: Some("replicated".to_string()),
                    })
                }
                _ => None,
            };

            let event: DomainEvent = record.into();
            if let Err(err) = domain_events.send(event) {
                tracing::debug!(?err, "daemon-source domain_event publish dropped: channel closed or no subscribers yet");
            }
            if let Some(pages) = also_pages
                && let Err(err) = domain_events.send(pages)
            {
                tracing::debug!(?err, "daemon-source pages-changed publish dropped");
            }
        }
    });
    EventBridge { task }
}
