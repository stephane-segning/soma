//! Smoke tests for the BFF route surface.
//!
//! These tests do not start the underlying daemon (they construct
//! `DaemonRuntime` but never `.start()` it). That's deliberate — we
//! cover the **routing / extractor wiring** here: every route in
//! `desktop_bff::routes` returns *some* response over HTTP, with the
//! right status code, against the right shape of request body.
//!
//! Routes that need a live daemon get a 500-with-`{kind: "daemon"}`
//! payload (covered by `ApiError`'s tests); routes that don't (`daemon`,
//! `search`, `practice_*`) return a fully-formed 200.

use std::net::SocketAddr;
use std::sync::Arc;

use desktop_agent::config::AgentRuntimeConfig;
use desktop_agent::runtime::AgentRuntime;
use desktop_agent::service::{AgentService, StaticConfigSource};
use desktop_api::{AppState, DOMAIN_EVENT_CHANNEL_CAPACITY};
use desktop_bff::{BffConfig, build_router};
use desktop_daemon::runtime::{DaemonRuntime, DaemonRuntimeOptions};
use desktop_services::practice::PracticeService;
use tempfile::TempDir;
use tokio::net::TcpListener;
use tokio::sync::broadcast;

/// Boots a router on a random port without starting the daemon. Returns
/// the address the test client should hit plus the tempdir so it's not
/// dropped (and the spawned axum task so the test can abort it).
struct Harness {
    addr: SocketAddr,
    _tmp: TempDir,
    server: tokio::task::JoinHandle<()>,
}

impl Drop for Harness {
    fn drop(&mut self) {
        self.server.abort();
    }
}

async fn spawn_router() -> Harness {
    let tmp = TempDir::new().expect("tempdir");
    let daemon = Arc::new(DaemonRuntime::new(DaemonRuntimeOptions::new(tmp.path())));
    let agent_runtime = Arc::new(AgentRuntime::new());
    let config_source = Arc::new(StaticConfigSource(AgentRuntimeConfig::default()));
    let agent_service = AgentService::new(config_source, Arc::clone(&agent_runtime));
    let practice = Arc::new(PracticeService::new());
    let (tx, _rx) = broadcast::channel(DOMAIN_EVENT_CHANNEL_CAPACITY);
    let state = Arc::new(AppState::new(daemon, agent_runtime, agent_service, practice, tx));

    let config = BffConfig {
        user_data_dir: tmp.path().to_path_buf(),
        ..BffConfig::default()
    };
    let router = build_router(state, &config);
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
    let addr = listener.local_addr().expect("local_addr");
    let server = tokio::spawn(async move {
        axum::serve(listener, router).await.expect("serve");
    });
    Harness { addr, _tmp: tmp, server }
}

/// `search` has no daemon backing — it always returns `[]`. Pinning this
/// is the cheapest smoke test that "the new route exists and dispatches
/// to the handler" without spinning up the daemon.
#[tokio::test]
async fn search_route_returns_empty_list() {
    let h = spawn_router().await;
    let resp = reqwest::Client::new()
        .post(format!("http://{}/api/v1/search", h.addr))
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .await
        .expect("post");
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.expect("json");
    assert_eq!(body, serde_json::json!([]));
}

/// `daemon_ready` is contracted to be a structured boolean even when the
/// daemon isn't up — when the handle resolves to `Err`, it maps to
/// `false`, not a 500. Mirrors the renderer's "ready light" semantics.
#[tokio::test]
async fn daemon_ready_returns_false_when_daemon_idle() {
    let h = spawn_router().await;
    let resp = reqwest::Client::new()
        .post(format!("http://{}/api/v1/daemon_ready", h.addr))
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .await
        .expect("post");
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.expect("json");
    assert_eq!(body, serde_json::Value::Bool(false));
}

/// `practice_list_exercises` is in-process state — no daemon needed.
/// A request with no space id returns the default-empty list.
#[tokio::test]
async fn practice_list_exercises_returns_empty_list() {
    let h = spawn_router().await;
    let resp = reqwest::Client::new()
        .post(format!("http://{}/api/v1/practice_list_exercises", h.addr))
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .await
        .expect("post");
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.expect("json");
    assert_eq!(body, serde_json::json!([]));
}

/// A daemon-backed route should return 500 with the `{kind: "daemon"}`
/// error envelope when the daemon isn't running. Confirms the route is
/// wired (no 404) and that `ApiError` maps the failure correctly. We use
/// `spaces_list` because it's the simplest daemon call: an empty body
/// deserializes into the default-valued args struct.
#[tokio::test]
async fn spaces_list_returns_daemon_error_when_daemon_idle() {
    let h = spawn_router().await;
    let resp = reqwest::Client::new()
        .post(format!("http://{}/api/v1/spaces_list", h.addr))
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .await
        .expect("post");
    assert_eq!(resp.status(), 500);
    let body: serde_json::Value = resp.json().await.expect("json");
    assert_eq!(body["kind"], "daemon");
    assert!(body["message"].is_string(), "expected a daemon error message, got {body}");
}

/// Missing route → 404 (not 405 / 500). Guards against typos in the
/// route table by pinning that something that shouldn't exist really
/// doesn't.
#[tokio::test]
async fn unknown_route_returns_404() {
    let h = spawn_router().await;
    let resp = reqwest::Client::new()
        .post(format!("http://{}/api/v1/does_not_exist", h.addr))
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .await
        .expect("post");
    assert_eq!(resp.status(), 404);
}
