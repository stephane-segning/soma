use std::sync::Arc;

use axum::{Router, routing::get};
use prometheus_client::{
    encoding::text::encode,
    metrics::{counter::Counter, family::Family},
    registry::Registry,
};
use prometheus_client_derive_encode::EncodeLabelSet;

/// Build a minimal metrics/health router for a given service name.
///
/// Metrics are exposed as plain text Prometheus format at `/metrics`.
/// Health is exposed at `/healthz`.
pub type SharedRegistry = std::sync::Arc<Registry>;

pub fn router(service_name: &'static str) -> Router {
    let mut registry = Registry::with_prefix(format!("soma_{}", service_name));

    #[derive(Clone, Debug, Hash, PartialEq, Eq, EncodeLabelSet)]
    struct ServiceLabel {
        service: &'static str,
    }

    let info = Family::<ServiceLabel, Counter>::default();
    info.get_or_create(&ServiceLabel {
        service: service_name,
    })
    .inc();
    registry.register("info", "Static service label", info);

    router_with_registry(Arc::new(registry))
}

/// Router that exposes `/metrics` for a supplied registry.
pub fn router_with_registry(registry: SharedRegistry) -> Router {
    Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route(
            "/metrics",
            get(move || {
                let registry = registry.clone();
                async move {
                    let mut buffer = String::new();
                    encode(&mut buffer, &registry).expect("encode metrics");
                    buffer
                }
            }),
        )
}
