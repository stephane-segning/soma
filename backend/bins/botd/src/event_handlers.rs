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

impl From<soma_proto_build::spaceroom::JoinDecisionType> for JoinDecisionOutcome {
    fn from(value: soma_proto_build::spaceroom::JoinDecisionType) -> Self {
        use soma_proto_build::spaceroom::JoinDecisionType::*;

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
                    soma_proto_build::spaceroom::JoinDecisionType::try_from(decision.decision)
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
                info!(%peer_id, listen_addr=%address, "bot listening");
            }
            PeerEvent::PingOk { rtt } => {
                info!(?rtt, "ping success");
            }
            PeerEvent::PingErr { error } => {
                warn!(%error, "ping error");
            }
            PeerEvent::ConnectionEstablished { peer } => {
                info!(%peer, "bot connection established");
            }
            PeerEvent::ConnectionError { peer, error } => {
                warn!(?peer, %error, "bot connection error");
            }
            PeerEvent::IdentifyReceived {
                peer,
                agent,
                protocols,
            } => {
                info!(%peer, %agent, protocols, "bot identify received");
            }
            PeerEvent::MdnsDiscovered { peers } => {
                info!(peers, "bot mdns discovered peers");
            }
            PeerEvent::RendezvousDiscovered { registrations } => {
                info!(registrations, "bot rendezvous discovered");
            }
            PeerEvent::RelayReserved { relay } => {
                info!(%relay, "bot relay reservation accepted");
            }
            PeerEvent::RelayCircuitEstablished { relay } => {
                info!(%relay, "bot relay circuit established");
            }
            PeerEvent::ListenerClosed { reason } => {
                warn!(?reason, "bot listener closed");
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
