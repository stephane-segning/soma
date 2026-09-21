//! Shared integration-test harness. Not a test file itself — included via
//! `mod support;` from each top-level file under `tests/` (Cargo only
//! turns a *direct* `tests/*.rs` file into its own test binary; a nested
//! `tests/support/mod.rs` is just a module, same convention as the
//! ecosystem's usual `tests/common/mod.rs`).
//!
//! Each `tests/*.rs` file compiles this module as part of its own,
//! separate binary and only uses the subset of this surface it needs —
//! so `dead_code` is expected and not a signal of anything actually
//! unused across the suite as a whole.
#![allow(dead_code)]

use std::net::SocketAddr;
use std::sync::Arc;

use desktop_agent::config::AgentRuntimeConfig;
use desktop_agent::runtime::AgentRuntime;
use desktop_agent::service::{AgentService, StaticConfigSource};
use desktop_api::{AGENT_EVENT_CHANNEL_CAPACITY, AppState, DOMAIN_EVENT_CHANNEL_CAPACITY};
use desktop_bff::{BffConfig, build_router};
use desktop_daemon::runtime::{DaemonRuntime, DaemonRuntimeOptions};
use desktop_services::practice::PracticeService;
use tempfile::TempDir;
use tokio::net::TcpListener;
use tokio::sync::{broadcast, watch};

/// Every test in this crate authenticates with this token unless it's
/// specifically testing rejection. Chosen to be valid on every channel
/// `auth` supports (HTTP-token-safe: no `/`, `+`, `=`, spaces, commas —
/// see `desktop_bff::auth`'s module doc), so the same constant works for
/// `Authorization` header tests and `Sec-WebSocket-Protocol` tests alike.
pub const TEST_TOKEN: &str = "test-token-0123456789abcdef";

/// Boots a router on a random port without starting the daemon (tests
/// that need daemon-backed behavior construct their own `DaemonHandle`
/// separately — most of this suite deliberately covers the *unstarted*
/// case, matching the doc comment on `routes.rs`). Returns the address
/// the test client should hit plus everything that must stay alive for
/// the duration of the test (tempdir, spawned server task, shutdown
/// sender for tests that exercise clean-shutdown behavior).
pub struct Harness {
    pub addr: SocketAddr,
    pub domain_events_tx: broadcast::Sender<desktop_daemon::events::DomainEvent>,
    pub agent_events_tx: broadcast::Sender<desktop_agent::types::AgentRuntimeEvent>,
    pub shutdown_tx: watch::Sender<bool>,
    _tmp: TempDir,
    server: tokio::task::JoinHandle<()>,
}

impl Drop for Harness {
    fn drop(&mut self) {
        self.server.abort();
    }
}

/// Same as [`spawn_router`] but lets the caller override `BffConfig`
/// fields (e.g. `allowed_origins`) before the router is built. `token`
/// still wins over whatever `configure` sets for `auth_token`, so callers
/// can't accidentally build an unauthenticated test server.
pub async fn spawn_router_with(token: &str, configure: impl FnOnce(&mut BffConfig)) -> Harness {
    let tmp = TempDir::new().expect("tempdir");
    let daemon = Arc::new(DaemonRuntime::new(DaemonRuntimeOptions::new(tmp.path())));
    let agent_runtime = Arc::new(AgentRuntime::new());
    let config_source = Arc::new(StaticConfigSource(AgentRuntimeConfig::default()));
    let agent_service = AgentService::new(config_source, Arc::clone(&agent_runtime));
    let practice = Arc::new(PracticeService::new());
    let (domain_events_tx, _domain_rx) = broadcast::channel(DOMAIN_EVENT_CHANNEL_CAPACITY);
    let (agent_events_tx, _agent_rx) = broadcast::channel(AGENT_EVENT_CHANNEL_CAPACITY);
    let state = Arc::new(AppState::new(
        daemon,
        agent_runtime,
        agent_service,
        practice,
        domain_events_tx.clone(),
        agent_events_tx.clone(),
    ));

    let mut config = BffConfig {
        user_data_dir: tmp.path().to_path_buf(),
        auth_token: token.to_string(),
        ..BffConfig::default()
    };
    configure(&mut config);
    config.auth_token = token.to_string();

    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let router = build_router(state, &config, shutdown_rx);
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
    let addr = listener.local_addr().expect("local_addr");
    let server = tokio::spawn(async move {
        axum::serve(listener, router).await.expect("serve");
    });

    Harness {
        addr,
        domain_events_tx,
        agent_events_tx,
        shutdown_tx,
        _tmp: tmp,
        server,
    }
}

pub async fn spawn_router() -> Harness {
    spawn_router_with(TEST_TOKEN, |_| {}).await
}

/// `http://` base URL for `addr`, for building request URLs.
pub fn http_base(addr: SocketAddr) -> String {
    format!("http://{addr}")
}

/// `ws://` base URL for `addr`, for building WebSocket URLs.
pub fn ws_base(addr: SocketAddr) -> String {
    format!("ws://{addr}")
}
