use prometheus_client::{
    metrics::{counter::Counter, family::Family},
    registry::Registry,
};
use prometheus_client_derive_encode::EncodeLabelSet;
use soma_metrics::SharedRegistry;

#[derive(Clone, Debug, EncodeLabelSet, Hash, PartialEq, Eq)]
pub struct PingLabels {
    pub outcome: &'static str,
}

#[derive(Clone, Debug, EncodeLabelSet, Hash, PartialEq, Eq)]
pub struct JoinDecisionLabels {
    pub outcome: &'static str,
}

#[derive(Clone)]
pub struct BotMetrics {
    pub registry: SharedRegistry,
    pub listeners: Family<(), Counter>,
    pub pings: Family<PingLabels, Counter>,
    pub join_decisions: Family<JoinDecisionLabels, Counter>,
}

impl BotMetrics {
    pub fn new() -> Self {
        let mut registry = Registry::with_prefix("soma_bot");

        let listeners = Family::<(), Counter>::default();
        registry.register(
            "listen_events_total",
            "Bot listen events",
            listeners.clone(),
        );

        let pings = Family::<PingLabels, Counter>::default();
        registry.register("ping_total", "Ping successes/failures", pings.clone());

        let join_decisions = Family::<JoinDecisionLabels, Counter>::default();
        registry.register(
            "join_decisions_total",
            "Join decisions by outcome",
            join_decisions.clone(),
        );

        Self {
            registry: std::sync::Arc::new(registry),
            listeners,
            pings,
            join_decisions,
        }
    }
}
