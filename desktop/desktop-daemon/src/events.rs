//! Bridge from `soma_daemon::DaemonHandle::subscribe_events` to the renderer
//! `domain_event` IPC channel. Mirrors
//! `desktop/soma/src/main/services/startup-service/daemon-events.ts`.
//!
//! The bridge is a single spawned `tokio` task. It owns the mpsc receiver
//! the daemon hands out; dropping the bridge stops translation (the daemon
//! task ends on its own when the receiver drops).

use std::sync::Arc;

use desktop_services::events::DomainEventsBroadcaster;
use serde::Serialize;
use soma_daemon::DaemonHandle;
use soma_daemon::handle_types::DaemonEventRecord;
use specta::Type;
use tauri::Runtime;
use tokio::task::JoinHandle;

/// Renderer-facing payload. Tagged on `kind` to match the discriminated
/// union the renderer's `@soma/desktop-db` parser accepts.
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

/// Subscribe to `daemon`'s event firehose and re-emit each event via
/// `domain_event` on every webview window. Mirrors the
/// `DaemonEventStreamBridge.start()` flow in the old Electron startup
/// service.
///
/// Buffer is forwarded to `DaemonHandle::subscribe_events`; 256 is the same
/// default the napi addon used.
pub fn spawn<R: Runtime>(app: tauri::AppHandle<R>, daemon: DaemonHandle, buffer: usize) -> EventBridge {
    let mut rx = daemon.subscribe_events(buffer);
    let app = Arc::new(app);
    let task = tokio::spawn(async move {
        while let Some(record) = rx.recv().await {
            let event: DomainEvent = record.into();
            if let Err(err) = DomainEventsBroadcaster::broadcast(&*app, &event) {
                tracing::warn!(?err, "domain_event broadcast failed");
            }
        }
    });
    EventBridge { task }
}
