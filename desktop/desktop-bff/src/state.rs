//! BFF-side process state.
//!
//! `AppState` (the handler state) lives in `desktop-api` so the Tauri
//! shell can share it. This module owns the BFF-only boot config and the
//! router factory that mounts every route plus CORS / trace middleware.

use std::net::SocketAddr;
use std::sync::Arc;

use axum::Router;
use desktop_api::AppState;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

use crate::routes;

/// Process-level config for the BFF binary.
#[derive(Debug, Clone)]
pub struct BffConfig {
    /// Socket the axum server binds to. Default: `127.0.0.1:4123` (the
    /// SDK's `httpTransport` is happy as long as `baseUrl` matches).
    pub bind_addr: SocketAddr,
}

impl Default for BffConfig {
    fn default() -> Self {
        Self {
            bind_addr: "127.0.0.1:4123".parse().expect("hard-coded SocketAddr"),
        }
    }
}

/// Build the axum router. Exposed so integration tests can mount the
/// router on their own listener without going through `main.rs`.
///
/// CORS is `permissive` for local development — production deployments
/// must wrap the router with a stricter origin allowlist before binding.
pub fn build_router(state: Arc<AppState>) -> Router {
    Router::new()
        .merge(routes::router())
        .with_state(state)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
}
