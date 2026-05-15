use libp2p::{Multiaddr, PeerId};
use prost::Message;
use soma_peer::PeerCommand;
use soma_proto_build::space::JoinDecision;
use soma_storage::{RepositoryProvider, mailbox::MailboxEntry};
use tokio::sync::mpsc;
use tracing::warn;

use crate::{
    decode_outgoing_join_request_payload, MAILBOX_KIND_JOIN_DECISION, MAILBOX_KIND_JOIN_REQUEST,
};

pub(super) async fn lease_for_send(
    repos: &dyn RepositoryProvider,
    local_peer_id: &PeerId,
    mailbox_id: &str,
    now_secs: i64,
) -> bool {
    repos
        .mailbox_repo()
        .lease(mailbox_id, &local_peer_id.to_string(), now_secs + 30)
        .await
        .map(|rows| rows > 0)
        .unwrap_or(false)
}

pub(super) async fn send_entry(
    repos: &dyn RepositoryProvider,
    peer_commands: &mpsc::Sender<PeerCommand>,
    entry: MailboxEntry,
    target: PeerId,
    require_addrs: bool,
) {
    match entry.kind.as_str() {
        MAILBOX_KIND_JOIN_DECISION => {
            let Some(decision) = decode_join_decision(repos, &entry).await else {
                return;
            };
            let _ = peer_commands
                .send(PeerCommand::SendJoinDecision {
                    target,
                    addrs: Vec::new(),
                    delivery_id: entry.id,
                    decision,
                })
                .await;
        }
        MAILBOX_KIND_JOIN_REQUEST => {
            let Some((request_id, addrs, request)) =
                decode_join_request(repos, &entry, require_addrs).await
            else {
                return;
            };
            let _ = peer_commands
                .send(PeerCommand::SendJoinRequest {
                    target,
                    addrs,
                    delivery_id: entry.id,
                    request_id,
                    request,
                })
                .await;
        }
        _ => {
            let _ = repos.mailbox_repo().mark_dead(&entry.id).await;
        }
    }
}

async fn decode_join_decision(
    repos: &dyn RepositoryProvider,
    entry: &MailboxEntry,
) -> Option<JoinDecision> {
    let payload = entry.payload.as_ref()?;
    match JoinDecision::decode(payload.as_slice()) {
        Ok(decision) => Some(decision),
        Err(err) => {
            warn!(%err, mailbox_id=%entry.id, "failed to decode join decision payload");
            let _ = repos.mailbox_repo().mark_dead(&entry.id).await;
            None
        }
    }
}

async fn decode_join_request(
    repos: &dyn RepositoryProvider,
    entry: &MailboxEntry,
    require_addrs: bool,
) -> Option<(String, Vec<Multiaddr>, soma_proto_build::space::JoinRequest)> {
    let payload = entry.payload.as_ref()?;
    let outgoing = match decode_outgoing_join_request_payload(payload) {
        Ok(outgoing) => outgoing,
        Err(err) => {
            warn!(%err, mailbox_id=%entry.id, "failed to decode join request payload");
            let _ = repos.mailbox_repo().mark_dead(&entry.id).await;
            return None;
        }
    };

    let addrs = outgoing
        .addrs
        .into_iter()
        .filter_map(|addr| addr.parse::<Multiaddr>().ok())
        .collect::<Vec<_>>();

    if require_addrs && addrs.is_empty() {
        let _ = repos.mailbox_repo().mark_dead(&entry.id).await;
        return None;
    }

    Some((outgoing.request_id, addrs, outgoing.request))
}
