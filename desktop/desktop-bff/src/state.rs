//! BFF-side process state.
//!
//! `AppState` (the handler state) lives in `desktop-api` so the Tauri
//! shell can share it. This module owns the BFF-only boot config and the
//! router factory that mounts every route plus CORS / trace middleware.

use std::net::SocketAddr;
use std::sync::Arc;

use axum::Router;
use axum::http::{HeaderName, HeaderValue, Method, header};
use desktop_api::AppState;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::routes;

/// Process-level config for the BFF binary.
#[derive(Debug, Clone)]
pub struct BffConfig {
    /// Socket the axum server binds to. Default: `127.0.0.1:4123`.
    pub bind_addr: SocketAddr,
    /// Origins explicitly allowed to issue cross-origin requests against
    /// the BFF. When empty (the default) **no CORS layer is installed**,
    /// meaning only same-origin callers can reach the API — that's the
    /// right posture for the local-binary deployment where the SDK is
    /// expected to be served from the same origin. When the user runs
    /// `desktop-bff` for browser-based development they should set this
    /// to the SDK origin(s) explicitly so the layer can pair the
    /// allowlist with `allow_credentials(true)` (the SDK sends
    /// `credentials: "include"`, which forbids `*`).
    pub allowed_origins: Vec<HeaderValue>,
}

impl Default for BffConfig {
    fn default() -> Self {
        Self {
            bind_addr: "127.0.0.1:4123".parse().expect("hard-coded SocketAddr"),
            allowed_origins: Vec::new(),
        }
    }
}

/// Build the axum router. Exposed so integration tests can mount the
/// router on their own listener without going through `main.rs`.
///
/// CORS:
/// - `allowed_origins` empty → no CORS layer. Only same-origin callers
///   reach the API. This is the safest default for the local-binary
///   deployment where the renderer is served from `127.0.0.1:4123` too.
/// - `allowed_origins` non-empty → strict allowlist + `allow_credentials(true)`
///   so the SDK's `credentials: "include"` requests are accepted.
///   `CorsLayer::permissive()` would *not* work here — permissive sets
///   `Access-Control-Allow-Origin: *`, which is incompatible with
///   credentialed requests and would also let any visited webpage POST
///   to mutation endpoints like `documents_upsert_draft`.
pub fn build_router(state: Arc<AppState>, config: &BffConfig) -> Router {
    let mut router = Router::new()
        .merge(routes::router())
        .with_state(state)
        .layer(TraceLayer::new_for_http());

    if !config.allowed_origins.is_empty() {
        router = router.layer(build_cors(&config.allowed_origins));
    }
    router
}

fn build_cors(origins: &[HeaderValue]) -> CorsLayer {
    CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins.to_vec()))
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([
            header::CONTENT_TYPE,
            header::AUTHORIZATION,
            HeaderName::from_static("x-requested-with"),
        ])
        .allow_credentials(true)
}
