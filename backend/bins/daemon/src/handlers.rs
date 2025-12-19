use async_trait::async_trait;
use soma_peer::PeerEvent;
use soma_peer::events::{PeerEventHandler, PeerEventKind};
use tracing::{info, warn, debug, trace};

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
                debug!(?rtt, "daemon ping ok");
            }
            PeerEvent::PingErr { error } => {
                warn!(%error, "daemon ping error");
            }
            PeerEvent::IdentifyReceived {
                peer,
                agent,
                protocols,
            } => {
                debug!(%peer, %agent, protocols, "daemon identify received");
            }
            PeerEvent::MdnsDiscovered { peers } => {
                debug!(peers, "daemon mdns discovered peers");
            }
            PeerEvent::RendezvousDiscovered { registrations } => {
                debug!(registrations, "daemon rendezvous discovered");
            }
            PeerEvent::RelayReserved { relay } => {
                debug!(%relay, "daemon relay reservation accepted");
            }
            PeerEvent::RelayCircuitEstablished { relay } => {
                debug!(%relay, "daemon relay circuit established");
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
