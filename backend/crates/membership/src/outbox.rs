use std::time::SystemTime;

use libp2p::{Multiaddr, PeerId};
use prost::Message;
use soma_peer::PeerCommand;
use soma_proto_build::space::JoinDecision;
use soma_storage::RepositoryProvider;
use tokio::sync::mpsc;
use tracing::warn;

use crate::{
    MAILBOX_KIND_JOIN_DECISION, MAILBOX_KIND_JOIN_REQUEST, decode_outgoing_join_request_payload,
};

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
        match entry.kind.as_str() {
            MAILBOX_KIND_JOIN_DECISION => {
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

                let Some(payload) = entry.payload.clone() else {
                    let _ = repos.mailbox_repo().mark_dead(&entry.id).await;
                    continue;
                };
                let Ok(decision) = JoinDecision::decode(payload.as_slice()) else {
                    let _ = repos.mailbox_repo().mark_dead(&entry.id).await;
                    continue;
                };

                let _ = peer_commands
                    .send(PeerCommand::SendJoinDecision {
                        target,
                        addrs: Vec::new(),
                        delivery_id: entry.id.clone(),
                        decision,
                    })
                    .await;
            }
            MAILBOX_KIND_JOIN_REQUEST => {
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

                let Some(payload) = entry.payload.clone() else {
                    let _ = repos.mailbox_repo().mark_dead(&entry.id).await;
                    continue;
                };
                let outgoing = match decode_outgoing_join_request_payload(&payload) {
                    Ok(outgoing) => outgoing,
                    Err(_) => {
                        let _ = repos.mailbox_repo().mark_dead(&entry.id).await;
                        continue;
                    }
                };

                let mut addrs = Vec::new();
                for addr in outgoing.addrs {
                    if let Ok(parsed) = addr.parse::<Multiaddr>() {
                        addrs.push(parsed);
                    }
                }

                if addrs.is_empty() {
                    let _ = repos.mailbox_repo().mark_dead(&entry.id).await;
                    continue;
                }

                let _ = peer_commands
                    .send(PeerCommand::SendJoinRequest {
                        target,
                        addrs,
                        delivery_id: entry.id.clone(),
                        request_id: outgoing.request_id.clone(),
                        request: outgoing.request,
                    })
                    .await;
            }
            _ => {
                let _ = repos.mailbox_repo().mark_dead(&entry.id).await;
            }
        }
    }
}

/// Attempt delivery for a peer when we observe a connection establishment.
pub async fn deliver_for_peer(
    repos: &dyn RepositoryProvider,
    local_peer_id: &PeerId,
    peer_commands: &mpsc::Sender<PeerCommand>,
    peer: &PeerId,
) {
    let now_secs = epoch_seconds(SystemTime::now());

    let _ = repos.mailbox_repo().requeue_expired_leases(now_secs).await;

    let subject = peer.to_string();
    let entries = match repos
        .mailbox_repo()
        .list_due_for_subject(i64::MAX, &subject, 50)
        .await
    {
        Ok(entries) => entries,
        Err(err) => {
            warn!(%err, "failed to list mailbox entries for peer");
            return;
        }
    };

    for entry in entries {
        match entry.kind.as_str() {
            MAILBOX_KIND_JOIN_DECISION => {
                if !lease_for_send(repos, local_peer_id, &entry.id, now_secs).await {
                    continue;
                }

                let Some(payload) = entry.payload.clone() else {
                    let _ = repos.mailbox_repo().mark_dead(&entry.id).await;
                    continue;
                };

                let decision = match JoinDecision::decode(payload.as_slice()) {
                    Ok(d) => d,
                    Err(err) => {
                        warn!(%err, mailbox_id=%entry.id, "failed to decode join decision payload");
                        let _ = repos.mailbox_repo().mark_dead(&entry.id).await;
                        continue;
                    }
                };

                let _ = peer_commands
                    .send(PeerCommand::SendJoinDecision {
                        target: *peer,
                        addrs: Vec::new(),
                        delivery_id: entry.id.clone(),
                        decision,
                    })
                    .await;
            }
            MAILBOX_KIND_JOIN_REQUEST => {
                if !lease_for_send(repos, local_peer_id, &entry.id, now_secs).await {
                    continue;
                }

                let Some(payload) = entry.payload.clone() else {
                    let _ = repos.mailbox_repo().mark_dead(&entry.id).await;
                    continue;
                };

                let outgoing = match decode_outgoing_join_request_payload(&payload) {
                    Ok(o) => o,
                    Err(err) => {
                        warn!(%err, mailbox_id=%entry.id, "failed to decode join request payload");
                        let _ = repos.mailbox_repo().mark_dead(&entry.id).await;
                        continue;
                    }
                };

                let mut addrs = Vec::new();
                for addr in outgoing.addrs {
                    if let Ok(parsed) = addr.parse::<Multiaddr>() {
                        addrs.push(parsed);
                    }
                }

                let _ = peer_commands
                    .send(PeerCommand::SendJoinRequest {
                        target: *peer,
                        addrs,
                        delivery_id: entry.id.clone(),
                        request_id: outgoing.request_id,
                        request: outgoing.request,
                    })
                    .await;
            }
            _ => {}
        }
    }
}

pub async fn requeue_or_dead(repos: &dyn RepositoryProvider, mailbox_id: &str) {
    let now_secs = epoch_seconds(SystemTime::now());

    let entry = match repos.mailbox_repo().get(mailbox_id).await {
        Ok(Some(entry)) => entry,
        Ok(None) => return,
        Err(err) => {
            warn!(%err, %mailbox_id, "failed to load mailbox entry");
            return;
        }
    };

    // Hard TTL: 24h.
    if now_secs.saturating_sub(entry.created_at) > 24 * 60 * 60 {
        let _ = repos.mailbox_repo().mark_dead(mailbox_id).await;
        return;
    }

    let attempts = entry.attempts.max(1) as u32;
    let exp = attempts.saturating_sub(1).min(8);
    // Retry between 5 and 30 minutes.
    let delay = (300_i64.saturating_mul(1_i64 << exp)).clamp(300, 1800);
    let available_at = now_secs + delay;
    let _ = repos.mailbox_repo().requeue(mailbox_id, available_at).await;
}

async fn lease_for_send(
    repos: &dyn RepositoryProvider,
    local_peer_id: &PeerId,
    mailbox_id: &str,
    now_secs: i64,
) -> bool {
    let lease_until = now_secs + 30;
    match repos
        .mailbox_repo()
        .lease(mailbox_id, &local_peer_id.to_string(), lease_until)
        .await
    {
        Ok(rows) => rows > 0,
        Err(_) => false,
    }
}

fn epoch_seconds(now: SystemTime) -> i64 {
    now.duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
