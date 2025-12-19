use std::sync::Arc;

use async_trait::async_trait;
use soma_peer::{
    PeerEvent,
    events::{PeerEventHandler, PeerEventKind},
};
use tracing::{info, warn};

use crate::metrics::{BotMetrics, EventLabels, JoinDecisionLabels, PingLabels};

/// Handler that records metrics for every peer event.
pub struct MetricsHandler;

/// Handler that emits human-readable traces for notable peer events.
pub struct LoggingHandler;

/// All event label names in one place to avoid stringly-typed metrics keys.
#[derive(Clone, Copy)]
enum EventKindLabel {
    NewListenAddr,
    ListenerClosed,
    ConnectionEstablished,
    ConnectionError,
    PingOk,
    PingErr,
    IdentifyReceived,
    MdnsDiscovered,
    RendezvousDiscovered,
    RelayReserved,
    RelayCircuitEstablished,
    JoinRequestSubmitted,
    JoinDecision,
    JoinFailed,
}

impl EventKindLabel {
    fn as_str(self) -> &'static str {
        match self {
            EventKindLabel::NewListenAddr => "new_listen_addr",
            EventKindLabel::ListenerClosed => "listener_closed",
            EventKindLabel::ConnectionEstablished => "connection_established",
            EventKindLabel::ConnectionError => "connection_error",
            EventKindLabel::PingOk => "ping_ok",
            EventKindLabel::PingErr => "ping_err",
            EventKindLabel::IdentifyReceived => "identify_received",
            EventKindLabel::MdnsDiscovered => "mdns_discovered",
            EventKindLabel::RendezvousDiscovered => "rendezvous_discovered",
            EventKindLabel::RelayReserved => "relay_reserved",
            EventKindLabel::RelayCircuitEstablished => "relay_circuit_established",
            EventKindLabel::JoinRequestSubmitted => "join_request_submitted",
            EventKindLabel::JoinDecision => "join_decision",
            EventKindLabel::JoinFailed => "join_failed",
        }
    }
}

#[derive(Clone, Copy)]
enum JoinDecisionOutcome {
    Approved,
    Rejected,
    Blocked,
    Unspecified,
}

impl JoinDecisionOutcome {
    fn as_str(self) -> &'static str {
        match self {
            JoinDecisionOutcome::Approved => "approved",
            JoinDecisionOutcome::Rejected => "rejected",
            JoinDecisionOutcome::Blocked => "blocked",
            JoinDecisionOutcome::Unspecified => "unspecified",
        }
    }
}

impl From<soma_proto_build::classroom::v1::JoinDecisionType> for JoinDecisionOutcome {
    fn from(value: soma_proto_build::classroom::v1::JoinDecisionType) -> Self {
        use soma_proto_build::classroom::v1::JoinDecisionType::*;

        match value {
            JoinApproved => JoinDecisionOutcome::Approved,
            JoinRejected => JoinDecisionOutcome::Rejected,
            JoinBlocked => JoinDecisionOutcome::Blocked,
            JoinDecisionUnspecified => JoinDecisionOutcome::Unspecified,
        }
    }
}

/// Build the list of peer event handlers that botd uses.
pub fn build_handlers() -> Vec<Arc<dyn PeerEventHandler<BotMetrics>>> {
    vec![Arc::new(MetricsHandler), Arc::new(LoggingHandler)]
}

#[async_trait]
impl PeerEventHandler<BotMetrics> for MetricsHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        PeerEventKind::ALL
    }

    async fn handle(&self, metrics: &BotMetrics, evt: &PeerEvent) {
        match evt {
            PeerEvent::NewListenAddr { .. } => {
                record_event(metrics, EventKindLabel::NewListenAddr);
                metrics.listeners.get_or_create(&()).inc();
            }
            PeerEvent::ListenerClosed { .. } => {
                record_event(metrics, EventKindLabel::ListenerClosed);
            }
            PeerEvent::ConnectionEstablished { .. } => {
                record_event(metrics, EventKindLabel::ConnectionEstablished);
            }
            PeerEvent::ConnectionError { .. } => {
                record_event(metrics, EventKindLabel::ConnectionError);
            }
            PeerEvent::PingOk { .. } => {
                record_event(metrics, EventKindLabel::PingOk);
                record_ping(metrics, "ok");
            }
            PeerEvent::PingErr { .. } => {
                record_event(metrics, EventKindLabel::PingErr);
                record_ping(metrics, "error");
            }
            PeerEvent::IdentifyReceived { .. } => {
                record_event(metrics, EventKindLabel::IdentifyReceived);
            }
            PeerEvent::MdnsDiscovered { .. } => {
                record_event(metrics, EventKindLabel::MdnsDiscovered);
            }
            PeerEvent::RendezvousDiscovered { .. } => {
                record_event(metrics, EventKindLabel::RendezvousDiscovered);
            }
            PeerEvent::RelayReserved { .. } => {
                record_event(metrics, EventKindLabel::RelayReserved);
            }
            PeerEvent::RelayCircuitEstablished { .. } => {
                record_event(metrics, EventKindLabel::RelayCircuitEstablished);
            }
            PeerEvent::JoinRequestSubmitted { .. } => {
                record_event(metrics, EventKindLabel::JoinRequestSubmitted);
            }
            PeerEvent::JoinDecision { decision, .. } => {
                record_event(metrics, EventKindLabel::JoinDecision);
                let outcome =
                    soma_proto_build::classroom::v1::JoinDecisionType::try_from(decision.decision)
                        .map(JoinDecisionOutcome::from)
                        .unwrap_or(JoinDecisionOutcome::Unspecified);
                metrics
                    .join_decisions
                    .get_or_create(&JoinDecisionLabels {
                        outcome: outcome.as_str(),
                    })
                    .inc();
            }
            PeerEvent::JoinFailed { .. } => {
                record_event(metrics, EventKindLabel::JoinFailed);
            }
        }
    }
}

#[async_trait]
impl PeerEventHandler<BotMetrics> for LoggingHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[
            PeerEventKind::NewListenAddr,
            PeerEventKind::PingOk,
            PeerEventKind::PingErr,
            PeerEventKind::ConnectionEstablished,
            PeerEventKind::ConnectionError,
            PeerEventKind::IdentifyReceived,
            PeerEventKind::MdnsDiscovered,
            PeerEventKind::RendezvousDiscovered,
            PeerEventKind::RelayReserved,
            PeerEventKind::RelayCircuitEstablished,
            PeerEventKind::ListenerClosed,
        ]
    }

    async fn handle(&self, _metrics: &BotMetrics, evt: &PeerEvent) {
        match evt {
            PeerEvent::NewListenAddr { address, peer_id } => {
                log_listen(peer_id, address);
            }
            PeerEvent::PingOk { rtt } => {
                log_ping_ok(rtt);
            }
            PeerEvent::PingErr { error } => {
                log_ping_err(error);
            }
            PeerEvent::ConnectionEstablished { peer } => {
                log_connection_established(peer);
            }
            PeerEvent::ConnectionError { peer, error } => {
                log_connection_error(peer, error);
            }
            PeerEvent::IdentifyReceived {
                peer,
                agent,
                protocols,
            } => log_identify(peer, agent, *protocols),
            PeerEvent::MdnsDiscovered { peers } => {
                log_mdns(peers);
            }
            PeerEvent::RendezvousDiscovered { registrations } => {
                log_rendezvous(registrations);
            }
            PeerEvent::RelayReserved { relay } => {
                log_relay_reserved(relay);
            }
            PeerEvent::RelayCircuitEstablished { relay } => {
                log_relay_circuit(relay);
            }
            PeerEvent::ListenerClosed { reason } => {
                log_listener_closed(reason);
            }
            _ => {}
        }
    }
}

fn record_event(metrics: &BotMetrics, label: EventKindLabel) {
    metrics
        .events
        .get_or_create(&EventLabels {
            kind: label.as_str(),
        })
        .inc();
}

fn record_ping(metrics: &BotMetrics, outcome: &'static str) {
    metrics.pings.get_or_create(&PingLabels { outcome }).inc();
}

fn log_listen(peer_id: &libp2p::PeerId, address: &libp2p::Multiaddr) {
    info!(%peer_id, listen_addr=%address, "bot listening");
}

fn log_ping_ok(rtt: &std::time::Duration) {
    info!(?rtt, "ping success");
}

fn log_ping_err(error: &str) {
    warn!(%error, "ping error");
}

fn log_connection_established(peer: &libp2p::PeerId) {
    info!(%peer, "bot connection established");
}

fn log_connection_error(peer: &Option<libp2p::PeerId>, error: &str) {
    warn!(?peer, %error, "bot connection error");
}

fn log_identify(peer: &libp2p::PeerId, agent: &str, protocols: usize) {
    info!(%peer, %agent, protocols, "bot identify received");
}

fn log_mdns(peers: &usize) {
    info!(peers, "bot mdns discovered peers");
}

fn log_rendezvous(registrations: &usize) {
    info!(registrations, "bot rendezvous discovered");
}

fn log_relay_reserved(relay: &libp2p::PeerId) {
    info!(%relay, "bot relay reservation accepted");
}

fn log_relay_circuit(relay: &libp2p::PeerId) {
    info!(%relay, "bot relay circuit established");
}

fn log_listener_closed(reason: &String) {
    warn!(?reason, "bot listener closed");
}
