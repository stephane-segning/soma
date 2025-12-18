use axum::{routing::get, Router};

/// Build a minimal metrics/health router for a given service name.
///
/// Metrics are exposed as plain text Prometheus format at `/metrics`.
/// Health is exposed at `/healthz`.
pub fn router(service_name: &'static str) -> Router {
    let metrics_body = format!(
        "# HELP service_info Static service label\n# TYPE service_info gauge\nservice_info{{service=\"{}\"}} 1\n",
        service_name
    );

    Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/metrics", get(move || {
            let body = metrics_body.clone();
            async move { body }
        }))
}
