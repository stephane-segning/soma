use async_trait::async_trait;
use soma_peer::PeerEvent;
use soma_peer::events::{PeerEventHandler, PeerEventKind};
use soma_membership::apply_join_decision;
use soma_membership::{decode_outgoing_join_request_payload, MAILBOX_KIND_JOIN_DECISION, MAILBOX_KIND_JOIN_REQUEST};
use soma_proto_build::spaceroom::JoinDecision;
use soma_storage::mailbox::MailboxRepository;
use tracing::{info, warn};
use std::time::SystemTime;
use prost::Message;
use libp2p::Multiaddr;

use crate::DaemonState;

/// Logs connectivity-related events.
pub struct LoggingHandler;

#[async_trait]
impl PeerEventHandler<crate::DaemonState> for LoggingHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[
            PeerEventKind::NewListenAddr,
            PeerEventKind::ListenerClosed,
            PeerEventKind::ConnectionEstablished,
            PeerEventKind::ConnectionError,
            PeerEventKind::PingOk,
            PeerEventKind::PingErr,
            PeerEventKind::IdentifyReceived,
            PeerEventKind::MdnsDiscovered,
            PeerEventKind::RendezvousDiscovered,
            PeerEventKind::RelayReserved,
            PeerEventKind::RelayCircuitEstablished,
        ]
    }

    async fn handle(&self, _ctx: &DaemonState, event: &PeerEvent) {
        match event {
            PeerEvent::NewListenAddr { address, peer_id } => {
                info!(%peer_id, listen_addr=%address, "daemon listening");
            }
            PeerEvent::ListenerClosed { reason } => {
                info!(?reason, "daemon listener closed");
            }
            PeerEvent::ConnectionEstablished { peer } => {
                info!(%peer, "daemon connected");
            }
            PeerEvent::ConnectionError { peer, error } => {
                warn!(?peer, %error, "daemon connection error");
            }
            PeerEvent::PingOk { rtt } => {
                info!(?rtt, "daemon ping ok");
            }
            PeerEvent::PingErr { error } => {
                warn!(%error, "daemon ping error");
            }
            PeerEvent::IdentifyReceived {
                peer,
                agent,
                protocols,
            } => {
                info!(%peer, %agent, protocols, "daemon identify received");
            }
            PeerEvent::MdnsDiscovered { peers } => {
                info!(peers, "daemon mdns discovered peers");
            }
            PeerEvent::RendezvousDiscovered { registrations } => {
                info!(registrations, "daemon rendezvous discovered");
            }
            PeerEvent::RelayReserved { relay } => {
                info!(%relay, "daemon relay reservation accepted");
            }
            PeerEvent::RelayCircuitEstablished { relay } => {
                info!(%relay, "daemon relay circuit established");
            }
            _ => {}
        }
    }
}

/// Tracks listen addresses for status reporting.
pub struct ListenAddrHandler;

#[async_trait]
impl PeerEventHandler<crate::DaemonState> for ListenAddrHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[PeerEventKind::NewListenAddr]
    }

    async fn handle(&self, ctx: &DaemonState, event: &PeerEvent) {
        if let PeerEvent::NewListenAddr { address, .. } = event {
            let mut addrs = ctx.listen_addrs.lock().await;
            let addr = address.to_string();
            if !addrs.contains(&addr) {
                addrs.push(addr);
            }
        }
    }
}

/// Publishes join-related events to daemon subscribers.
pub struct JoinEventsHandler;
pub struct JoinDecisionPersistenceHandler;
pub struct MailboxOutboxHandler;

#[async_trait]
impl PeerEventHandler<crate::DaemonState> for JoinEventsHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[
            PeerEventKind::JoinRequestSubmitted,
            PeerEventKind::JoinDecision,
            PeerEventKind::JoinFailed,
        ]
    }

    async fn handle(&self, ctx: &DaemonState, event: &PeerEvent) {
        match event {
            PeerEvent::JoinRequestSubmitted { target, request_id } => {
                ctx.publish(crate::daemon::DaemonEvent {
                    event: Some(crate::daemon::daemon_event::Event::JoinSubmitted(
                        crate::daemon::JoinSubmitEvent {
                            request_id: request_id.clone(),
                            target_peer_id: target.to_string(),
                        },
                    )),
                })
                .await;
            }
            PeerEvent::JoinDecision { from, decision } => {
                ctx.publish(crate::daemon::DaemonEvent {
                    event: Some(crate::daemon::daemon_event::Event::JoinDecision(
                        crate::daemon::JoinDecisionEvent {
                            from_peer_id: from.to_string(),
                            decision: Some(decision.clone()),
                        },
                    )),
                })
                .await;
            }
            PeerEvent::JoinFailed { target, error } => {
                ctx.publish(crate::daemon::DaemonEvent {
                    event: Some(crate::daemon::daemon_event::Event::JoinFailed(
                        crate::daemon::JoinFailedEvent {
                            target_peer_id: target.to_string(),
                            error: error.clone(),
                        },
                    )),
                })
                .await;
            }
            _ => {}
        }
    }
}

#[async_trait]
impl PeerEventHandler<crate::DaemonState> for JoinDecisionPersistenceHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[PeerEventKind::JoinDecision]
    }

    async fn handle(&self, ctx: &DaemonState, event: &PeerEvent) {
        let PeerEvent::JoinDecision { from, decision } = event else {
            return;
        };

        // Ignore decisions we generated locally (decider path).
        if *from == ctx.peer_id {
            return;
        }

        // Ignore placeholder "pending manual approval" responses.
        if decision.decision_id.starts_with("reject-pending") {
            return;
        }

        if let Err(err) = apply_join_decision(&ctx.repos, decision).await {
            warn!(%err, "failed to apply join decision");
        }
    }
}

#[async_trait]
impl PeerEventHandler<crate::DaemonState> for MailboxOutboxHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[
            PeerEventKind::ConnectionEstablished,
            PeerEventKind::JoinRequestDeliveryAck,
            PeerEventKind::JoinRequestDeliveryFailed,
            PeerEventKind::JoinDecisionDeliveryAck,
            PeerEventKind::JoinDecisionDeliveryFailed,
        ]
    }

    async fn handle(&self, ctx: &DaemonState, event: &PeerEvent) {
        match event {
            PeerEvent::ConnectionEstablished { peer } => {
                deliver_due_for_peer(ctx, peer).await;
            }
            PeerEvent::JoinRequestDeliveryAck { delivery_id, .. } => {
                let _ = ctx.repos.mailbox().mark_done(delivery_id).await;
            }
            PeerEvent::JoinRequestDeliveryFailed { delivery_id, .. } => {
                requeue_or_dead(ctx, delivery_id).await;
            }
            PeerEvent::JoinDecisionDeliveryAck { delivery_id, .. } => {
                let _ = ctx.repos.mailbox().mark_done(delivery_id).await;
            }
            PeerEvent::JoinDecisionDeliveryFailed { delivery_id, .. } => {
                requeue_or_dead(ctx, delivery_id).await;
            }
            _ => {}
        }
    }
}

async fn deliver_due_for_peer(ctx: &DaemonState, peer: &libp2p::PeerId) {
    let now_secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let _ = ctx.repos.mailbox().requeue_expired_leases(now_secs).await;

    let subject = peer.to_string();
    let entries = match ctx
        .repos
        .mailbox()
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
                let lease_until = now_secs + 30;
                let leased = match ctx
                    .repos
                    .mailbox()
                    .lease(&entry.id, &ctx.peer_id.to_string(), lease_until)
                    .await
                {
                    Ok(rows) => rows,
                    Err(err) => {
                        warn!(%err, mailbox_id=%entry.id, "failed to lease mailbox entry");
                        continue;
                    }
                };
                if leased == 0 {
                    continue;
                }

                let Some(payload) = entry.payload.clone() else {
                    let _ = ctx.repos.mailbox().mark_dead(&entry.id).await;
                    continue;
                };

                let decision = match JoinDecision::decode(payload.as_slice()) {
                    Ok(d) => d,
                    Err(err) => {
                        warn!(%err, mailbox_id=%entry.id, "failed to decode join decision payload");
                        let _ = ctx.repos.mailbox().mark_dead(&entry.id).await;
                        continue;
                    }
                };

                let _ = ctx
                    .peer_commands
                    .send(soma_peer::PeerCommand::SendJoinDecision {
                        target: *peer,
                        addrs: Vec::new(),
                        delivery_id: entry.id.clone(),
                        decision,
                    })
                    .await;
            }
            MAILBOX_KIND_JOIN_REQUEST => {
                let lease_until = now_secs + 30;
                let leased = match ctx
                    .repos
                    .mailbox()
                    .lease(&entry.id, &ctx.peer_id.to_string(), lease_until)
                    .await
                {
                    Ok(rows) => rows,
                    Err(err) => {
                        warn!(%err, mailbox_id=%entry.id, "failed to lease mailbox entry");
                        continue;
                    }
                };
                if leased == 0 {
                    continue;
                }

                let Some(payload) = entry.payload.clone() else {
                    let _ = ctx.repos.mailbox().mark_dead(&entry.id).await;
                    continue;
                };

                let outgoing = match decode_outgoing_join_request_payload(&payload) {
                    Ok(o) => o,
                    Err(err) => {
                        warn!(%err, mailbox_id=%entry.id, "failed to decode join request payload");
                        let _ = ctx.repos.mailbox().mark_dead(&entry.id).await;
                        continue;
                    }
                };

                let mut addrs = Vec::new();
                for addr in outgoing.addrs {
                    if let Ok(parsed) = addr.parse::<Multiaddr>() {
                        addrs.push(parsed);
                    }
                }

                let _ = ctx
                    .peer_commands
                    .send(soma_peer::PeerCommand::SendJoinRequest {
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

async fn requeue_or_dead(ctx: &DaemonState, mailbox_id: &str) {
    let now_secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let entry = match ctx.repos.mailbox().get(mailbox_id).await {
        Ok(Some(entry)) => entry,
        Ok(None) => return,
        Err(err) => {
            warn!(%err, %mailbox_id, "failed to load mailbox entry");
            return;
        }
    };

    if now_secs.saturating_sub(entry.created_at) > 24 * 60 * 60 {
        let _ = ctx.repos.mailbox().mark_dead(mailbox_id).await;
        return;
    }

    let attempts = entry.attempts.max(1) as u32;
    let exp = attempts.saturating_sub(1).min(8);
    // Retry between 5 and 30 minutes.
    let delay = (300_i64.saturating_mul(1_i64 << exp)).clamp(300, 1800);
    let available_at = now_secs + delay;
    let _ = ctx.repos.mailbox().requeue(mailbox_id, available_at).await;
}
