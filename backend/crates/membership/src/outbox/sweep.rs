use std::time::SystemTime;

use libp2p::PeerId;
use soma_peer::PeerCommand;
use soma_storage::RepositoryProvider;
use tokio::sync::mpsc;
use tracing::warn;

use crate::time::epoch_seconds;

use super::common::{lease_for_send, send_entry};

/// Periodic sweep for due join outbox entries (both join requests and join decisions).
///
/// This is a time-based driver used when we don't have a connection event to trigger delivery.
pub async fn sweep_due(
    repos: &dyn RepositoryProvider,
    local_peer_id: &PeerId,
    peer_commands: &mpsc::Sender<PeerCommand>,
) {
    let now_secs = epoch_seconds(SystemTime::now());
    let _ = repos.mailbox_repo().requeue_expired_leases(now_secs).await;

    let entries = match repos.mailbox_repo().list_due(now_secs, 50).await {
        Ok(entries) => entries,
        Err(err) => {
            warn!(%err, "mailbox sweep failed to list entries");
            return;
        }
    };

    for entry in entries {
        let Some(subject_peer_id) = entry.subject_peer_id.clone() else {
            let _ = repos.mailbox_repo().mark_dead(&entry.id).await;
            continue;
        };
        let Ok(target) = subject_peer_id.parse() else {
            let _ = repos.mailbox_repo().mark_dead(&entry.id).await;
            continue;
        };

        if !lease_for_send(repos, local_peer_id, &entry.id, now_secs).await {
            continue;
        }

        if entry.payload.is_none() {
            let _ = repos.mailbox_repo().mark_dead(&entry.id).await;
            continue;
        }

        send_entry(repos, peer_commands, entry, target, true).await;
    }
}
