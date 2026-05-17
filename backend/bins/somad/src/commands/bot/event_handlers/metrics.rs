use async_trait::async_trait;
use soma_peer::{
    PeerEvent,
    events::{PeerEventHandler, PeerEventKind},
};

use super::metrics_labels::{EventKindLabel, JoinDecisionOutcome};
use crate::commands::bot::http::BotState;
use crate::commands::bot::metrics::{BotMetrics, EventLabels, JoinDecisionLabels, PingLabels};

/// Handler that records metrics for every peer event.
pub(super) struct MetricsHandler;

#[async_trait]
impl PeerEventHandler<BotState> for MetricsHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        PeerEventKind::ALL
    }

    async fn handle(&self, ctx: &BotState, evt: &PeerEvent) {
        let metrics = &ctx.metrics;
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
            PeerEvent::ConnectionError { error, .. } => {
                record_event(metrics, EventKindLabel::ConnectionError);
                if error.contains("blob request denied")
                    || error.contains("blob request missing space_id")
                {
                    metrics.blob_requests_denied.inc();
                }
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
            PeerEvent::JoinRequestDeliverySubmitted { .. } => {
                record_event(metrics, EventKindLabel::JoinRequestDeliverySubmitted);
            }
            PeerEvent::JoinRequestDeliveryAck { .. } => {
                record_event(metrics, EventKindLabel::JoinRequestDeliveryAck);
            }
            PeerEvent::JoinRequestDeliveryFailed { .. } => {
                record_event(metrics, EventKindLabel::JoinRequestDeliveryFailed);
            }
            PeerEvent::JoinDecision { decision, .. } => record_join_decision(metrics, decision),
            PeerEvent::JoinDecisionDeliverySubmitted { .. } => {
                record_event(metrics, EventKindLabel::JoinDecisionDeliverySubmitted);
            }
            PeerEvent::JoinDecisionDeliveryAck { .. } => {
                record_event(metrics, EventKindLabel::JoinDecisionDeliveryAck);
            }
            PeerEvent::JoinDecisionDeliveryFailed { .. } => {
                record_event(metrics, EventKindLabel::JoinDecisionDeliveryFailed);
            }
            PeerEvent::YooptaBlobAdded { .. } => {
                record_event(metrics, EventKindLabel::DocumentBlobAdded);
            }
            PeerEvent::BlobResponseReceived { .. } => {
                record_event(metrics, EventKindLabel::BlobResponseReceived);
            }
            PeerEvent::JoinFailed { .. } => record_event(metrics, EventKindLabel::JoinFailed),
        }
    }
}

fn record_join_decision(metrics: &BotMetrics, decision: &soma_proto_build::space::JoinDecision) {
    record_event(metrics, EventKindLabel::JoinDecision);
    let outcome = soma_proto_build::space::JoinDecisionType::try_from(decision.decision)
        .map(JoinDecisionOutcome::from)
        .unwrap_or(JoinDecisionOutcome::Unspecified);
    metrics
        .join_decisions
        .get_or_create(&JoinDecisionLabels {
            outcome: outcome.as_str(),
        })
        .inc();
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
