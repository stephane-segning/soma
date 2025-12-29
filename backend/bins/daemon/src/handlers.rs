use async_trait::async_trait;
use soma_common::{verify_issuer_capability, verify_membership_capability};
use soma_membership::apply_join_decision;
use libp2p::PeerId;
use soma_peer::PeerEvent;
use soma_peer::events::{PeerEventHandler, PeerEventKind};
use soma_proto_build::daemon;
use std::time::SystemTime;
use tracing::{info, warn};

use crate::grpc::DaemonState;

/// Logs connectivity-related events.
pub struct LoggingHandler;
pub struct IdentifyStoreHandler;

#[async_trait]
impl PeerEventHandler<DaemonState> for LoggingHandler {
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
                ..
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

#[async_trait]
impl PeerEventHandler<DaemonState> for IdentifyStoreHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[PeerEventKind::IdentifyReceived]
    }

    async fn handle(&self, ctx: &DaemonState, event: &PeerEvent) {
        let PeerEvent::IdentifyReceived {
            peer,
            public_key,
            ..
        } = event
        else {
            return;
        };

        if let Some(pk) = public_key {
            let mut map = ctx.identify_keys.lock().await;
            map.insert(*peer, pk.clone());
        }
    }
}

/// Tracks listen addresses for status reporting.
pub struct ListenAddrHandler;

#[async_trait]
impl PeerEventHandler<DaemonState> for ListenAddrHandler {
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
impl PeerEventHandler<DaemonState> for JoinEventsHandler {
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
                ctx.publish(daemon::DaemonEvent {
                    event: Some(daemon::daemon_event::Event::JoinSubmitted(
                        daemon::JoinSubmitEvent {
                            request_id: request_id.clone(),
                            target_peer_id: target.to_string(),
                        },
                    )),
                })
                .await;
            }
            PeerEvent::JoinDecision { from, decision } => {
                ctx.publish(daemon::DaemonEvent {
                    event: Some(daemon::daemon_event::Event::JoinDecision(
                        daemon::JoinDecisionEvent {
                            from_peer_id: from.to_string(),
                            decision: Some(decision.clone()),
                        },
                    )),
                })
                .await;
            }
            PeerEvent::JoinFailed { target, error } => {
                ctx.publish(daemon::DaemonEvent {
                    event: Some(daemon::daemon_event::Event::JoinFailed(
                        daemon::JoinFailedEvent {
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
impl PeerEventHandler<DaemonState> for JoinDecisionPersistenceHandler {
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

        // Verify membership capability signature and basics against the sender.
        let Some(cap) = decision.capability.as_ref() else {
            warn!(peer = %from, "rejected join decision: missing capability");
            return;
        };

        let pubkey = {
            let map = ctx.identify_keys.lock().await;
            map.get(from).cloned()
        };
        let Some(pubkey) = pubkey else {
            warn!(peer = %from, "rejected join decision: missing sender public key");
            return;
        };

        if let Err(err) =
            verify_membership_capability(cap, &pubkey, &ctx.peer_id, SystemTime::now())
        {
            warn!(%err, peer = %from, "rejected join decision: capability verification failed");
            return;
        }

        // If a delegated issuer capability is present, verify it when we can.
        if let Some(issuer_cap) = cap.issuer_cap.as_ref() {
            let owner_peer = issuer_cap
                .owner_peer_id
                .as_ref()
                .map(|p| p.value.clone())
                .unwrap_or_default();
            let now = SystemTime::now();

            if owner_peer == from.to_string() {
                // Owner signed directly (no delegation).
                if let Err(err) = verify_issuer_capability(issuer_cap, &pubkey, now) {
                    warn!(%err, peer = %from, "rejected join decision: issuer capability invalid");
                    return;
                }
            } else if let Ok(owner_id) = owner_peer.parse::<PeerId>() {
                // Delegated: verify using cached Identify pubkey for the owner.
                let map = ctx.identify_keys.lock().await;
                if let Some(owner_pk) = map.get(&owner_id) {
                    if let Err(err) = verify_issuer_capability(issuer_cap, owner_pk, now) {
                        warn!(%err, peer = %from, owner = %owner_peer, "rejected join decision: issuer delegation invalid");
                        return;
                    }
                } else {
                    warn!(
                        peer = %from,
                        owner = %owner_peer,
                        "rejected join decision: owner pubkey unavailable for issuer verification"
                    );
                    return;
                }
            } else {
                warn!(
                    peer = %from,
                    owner_peer,
                    "rejected join decision: malformed owner peer id"
                );
                return;
            }
        }

        if let Err(err) = apply_join_decision(&ctx.repos, decision).await {
            warn!(%err, "failed to apply join decision");
        }
    }
}

#[async_trait]
impl PeerEventHandler<DaemonState> for MailboxOutboxHandler {
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
                soma_membership::outbox::deliver_for_peer(
                    &ctx.repos,
                    &ctx.peer_id,
                    &ctx.peer_commands,
                    peer,
                )
                .await;
            }
            PeerEvent::JoinRequestDeliveryAck { delivery_id, .. } => {
                let _ = ctx.repos.mailbox_repo().mark_done(delivery_id).await;
            }
            PeerEvent::JoinRequestDeliveryFailed { delivery_id, .. } => {
                soma_membership::outbox::requeue_or_dead(&ctx.repos, delivery_id).await;
            }
            PeerEvent::JoinDecisionDeliveryAck { delivery_id, .. } => {
                let _ = ctx.repos.mailbox_repo().mark_done(delivery_id).await;
            }
            PeerEvent::JoinDecisionDeliveryFailed { delivery_id, .. } => {
                soma_membership::outbox::requeue_or_dead(&ctx.repos, delivery_id).await;
            }
            _ => {}
        }
    }
}
