//! In-process subscription to the daemon's broadcast event stream.
//!
//! The gRPC `stream_events` RPC subscribes to `state.events` and forwards
//! every `daemon::DaemonEvent` to the wire (`grpc/events.rs`). This module
//! exposes the same firehose to in-process embedders (the napi addon, tests)
//! as a `tokio::sync::mpsc` channel of plain [`DaemonEventRecord`]s — proto
//! types stay sealed inside the daemon crate so consumers don't pull in
//! `prost` or `tonic`.

use soma_proto_build::daemon;
use tokio_stream::StreamExt;
use tokio_stream::wrappers::BroadcastStream;

use super::{DaemonHandle, types::DaemonEventRecord};

impl DaemonHandle {
    /// Subscribe to the daemon event firehose. Returns a `tokio::sync::mpsc`
    /// receiver that yields plain [`DaemonEventRecord`]s; spawns a background
    /// task that translates proto events from the underlying broadcast and
    /// pushes them into the channel. The translator task ends when either the
    /// receiver is dropped (no more JS-side listeners) or the broadcast
    /// closes (the daemon shut down).
    ///
    /// `buffer` sizes the mpsc capacity; pick something matching the
    /// expected burst rate from the renderer.
    pub fn subscribe_events(&self, buffer: usize) -> tokio::sync::mpsc::Receiver<DaemonEventRecord> {
        let (tx, rx) = tokio::sync::mpsc::channel(buffer.max(1));
        let mut stream = BroadcastStream::new(self.state.events.subscribe());
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    // Prefer the close signal so unsubscribe wakes the task
                    // promptly even if no events are arriving — otherwise the
                    // broadcast receiver would linger until the next published
                    // event finally caused `tx.send` to fail.
                    biased;
                    _ = tx.closed() => break,
                    msg = stream.next() => {
                        let Some(msg) = msg else { break };
                        let Ok(event) = msg else {
                            // Lagged: BroadcastStream surfaces drops as Err.
                            // Skip and continue — losing transient events is
                            // preferable to killing the subscription.
                            continue;
                        };
                        let Some(payload) = event.event else { continue };
                        let Some(record) = map_event(payload) else { continue };
                        if tx.send(record).await.is_err() {
                            break;
                        }
                    }
                }
            }
        });
        rx
    }
}

fn map_event(payload: daemon::daemon_event::Event) -> Option<DaemonEventRecord> {
    match payload {
        daemon::daemon_event::Event::DocumentBlobAdded(e) => {
            Some(DaemonEventRecord::DocumentBlobAdded {
                space_id: e.space_id,
                doc_id: e.doc_id,
                cid: e.cid,
                mime: e.mime,
                size: e.size as i64,
                name: e.name,
            })
        }
        daemon::daemon_event::Event::JoinSubmitted(e) => Some(DaemonEventRecord::JoinSubmitted {
            request_id: e.request_id,
            target_peer_id: e.target_peer_id,
        }),
        daemon::daemon_event::Event::JoinDecision(e) => {
            let decision = e.decision.unwrap_or_default();
            Some(DaemonEventRecord::JoinDecision {
                from_peer_id: e.from_peer_id,
                space_id: decision.space_id.map(|s| s.value).unwrap_or_default(),
                decision: decision.decision,
                reason: decision.reason,
            })
        }
        daemon::daemon_event::Event::JoinFailed(e) => Some(DaemonEventRecord::JoinFailed {
            target_peer_id: e.target_peer_id,
            error: e.error,
        }),
    }
}
