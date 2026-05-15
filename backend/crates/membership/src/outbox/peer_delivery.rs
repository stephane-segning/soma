use std::time::SystemTime;

use libp2p::PeerId;
use soma_peer::PeerCommand;
use soma_storage::RepositoryProvider;
use tokio::sync::mpsc;
use tracing::warn;

use crate::{MAILBOX_KIND_JOIN_DECISION, MAILBOX_KIND_JOIN_REQUEST, time::epoch_seconds};

use super::common::{lease_for_send, send_entry};

/// Attempt delivery for a peer when we observe a connection establishment.
pub async fn deliver_for_peer(
    repos: &dyn RepositoryProvider,
    local_peer_id: &PeerId,
    peer_commands: &mpsc::Sender<PeerCommand>,
    peer: &PeerId,
) {
    let now_secs = epoch_seconds(SystemTime::now());
    let _ = repos.mailbox_repo().requeue_expired_leases(now_secs).await;

    let entries = match repos
        .mailbox_repo()
        .list_due_for_subject(i64::MAX, &peer.to_string(), 50)
        .await
    {
        Ok(entries) => entries,
        Err(err) => {
            warn!(%err, "failed to list mailbox entries for peer");
            return;
        }
    };

    for entry in entries {
        if !matches!(
            entry.kind.as_str(),
            MAILBOX_KIND_JOIN_DECISION | MAILBOX_KIND_JOIN_REQUEST
        ) {
            continue;
        }

        if !lease_for_send(repos, local_peer_id, &entry.id, now_secs).await {
            continue;
        }

        if entry.payload.is_none() {
            let _ = repos.mailbox_repo().mark_dead(&entry.id).await;
            continue;
        }

        send_entry(repos, peer_commands, entry, *peer, false).await;
    }
}
