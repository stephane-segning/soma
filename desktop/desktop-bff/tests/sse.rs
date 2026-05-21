//! End-to-end smoke test for the SSE endpoint.
//!
//! Builds a minimal `AppState` (daemon + agent runtimes constructed but
//! never started — the test does not exercise daemon-backed handlers), spins
//! up the axum router on a random port, connects an SSE client, then
//! publishes a renderer-source `DocumentChanged` event directly through
//! `AppState::domain_events.send(...)` and asserts the client receives the
//! `document_changed` payload.
//!
//! We bypass `desktop_api::documents::upsert_draft` because that would
//! require a running daemon; the SSE wiring itself is what we want to
//! cover.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use desktop_agent::config::AgentRuntimeConfig;
use desktop_agent::runtime::AgentRuntime;
use desktop_agent::service::{AgentService, StaticConfigSource};
use desktop_api::{AppState, DOMAIN_EVENT_CHANNEL_CAPACITY};
use desktop_bff::build_router;
use desktop_daemon::events::{DomainEvent, DomainEventSource};
use desktop_daemon::runtime::{DaemonRuntime, DaemonRuntimeOptions};
use desktop_services::practice::PracticeService;
use futures::StreamExt;
use tempfile::TempDir;
use tokio::net::TcpListener;
use tokio::sync::broadcast;

#[tokio::test]
async fn sse_endpoint_forwards_renderer_events() {
    let tmp = TempDir::new().expect("tempdir");
    let daemon = Arc::new(DaemonRuntime::new(DaemonRuntimeOptions::new(tmp.path())));
    let agent_runtime = Arc::new(AgentRuntime::new());
    let config_source = Arc::new(StaticConfigSource(AgentRuntimeConfig::default()));
    let agent_service = AgentService::new(config_source, Arc::clone(&agent_runtime));
    let practice = Arc::new(PracticeService::new());
    let (tx, _initial_rx) = broadcast::channel(DOMAIN_EVENT_CHANNEL_CAPACITY);
    let state = Arc::new(AppState::new(
        daemon,
        agent_runtime,
        agent_service,
        practice,
        tx.clone(),
    ));

    let router = build_router(state, &desktop_bff::BffConfig::default());
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind random port");
    let addr: SocketAddr = listener.local_addr().expect("local addr");
    let server = tokio::spawn(async move {
        axum::serve(listener, router).await.expect("axum serve");
    });

    // Give the server a beat to wire up.
    tokio::time::sleep(Duration::from_millis(50)).await;

    // Open the SSE stream. `reqwest` doesn't have first-class SSE parsing
    // but the body stream is enough for this smoke test — we just look for
    // the well-known event marker in the chunked text.
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("http://{addr}/api/v1/events"))
        .header("Accept", "text/event-stream")
        .send()
        .await
        .expect("sse connect");
    assert!(resp.status().is_success(), "SSE GET should be 2xx");

    let mut stream = resp.bytes_stream();

    // Subscribers register on `.subscribe()` — `BroadcastStream::new` runs
    // when the SSE handler future polls. Send after a short wait so the
    // subscriber has actually been registered before we publish.
    let publisher = tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(100)).await;
        let event = DomainEvent::DocumentChanged {
            source: DomainEventSource::Renderer,
            at_ms: 1_700_000_000_000,
            space_id: "space-1".into(),
            document_id: "doc-1".into(),
            reason: Some("sse-test".into()),
        };
        tx.send(event).expect("publish");
    });

    // Pull chunks until we see the event marker or hit the timeout.
    let mut buf = Vec::new();
    let saw = tokio::time::timeout(Duration::from_secs(5), async {
        while let Some(chunk) = stream.next().await {
            let bytes = chunk.expect("chunk");
            buf.extend_from_slice(&bytes);
            let text = std::str::from_utf8(&buf).unwrap_or("");
            if text.contains("event: domain_event") && text.contains("document-changed") {
                return true;
            }
        }
        false
    })
    .await
    .unwrap_or(false);

    publisher.await.ok();
    server.abort();
    assert!(
        saw,
        "expected a domain_event SSE frame carrying document-changed, got: {:?}",
        String::from_utf8_lossy(&buf)
    );
}

#[tokio::test]
async fn daemon_status_returns_200_with_unreachable_when_daemon_idle() {
    // `daemon::status` is contracted to *never* error — it returns a
    // structured `{ reachable: false, ... }` snapshot when the daemon
    // handle isn't ready. This test guards against that contract regressing
    // (any 5xx here would mean the SDK's status card silently breaks).
    let tmp = TempDir::new().expect("tempdir");
    let daemon = Arc::new(DaemonRuntime::new(DaemonRuntimeOptions::new(tmp.path())));
    let agent_runtime = Arc::new(AgentRuntime::new());
    let config_source = Arc::new(StaticConfigSource(AgentRuntimeConfig::default()));
    let agent_service = AgentService::new(config_source, Arc::clone(&agent_runtime));
    let practice = Arc::new(PracticeService::new());
    let (tx, _initial_rx) = broadcast::channel(DOMAIN_EVENT_CHANNEL_CAPACITY);
    let state = Arc::new(AppState::new(
        daemon,
        agent_runtime,
        agent_service,
        practice,
        tx,
    ));

    let router = build_router(state, &desktop_bff::BffConfig::default());
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind random port");
    let addr: SocketAddr = listener.local_addr().expect("local addr");
    let server = tokio::spawn(async move {
        axum::serve(listener, router).await.expect("axum serve");
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("http://{addr}/api/v1/daemon_status"))
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .await
        .expect("post");
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.expect("json");
    assert_eq!(body["reachable"], false);

    server.abort();
}

/// With the default config (empty `allowed_origins`) no CORS layer is
/// installed: cross-origin browsers can't read responses without an
/// explicit allowlist. We assert this by checking that an OPTIONS
/// preflight from a foreign origin gets *no* `Access-Control-Allow-Origin`
/// header back.
#[tokio::test]
async fn default_config_installs_no_cors_layer() {
    let tmp = TempDir::new().expect("tempdir");
    let daemon = Arc::new(DaemonRuntime::new(DaemonRuntimeOptions::new(tmp.path())));
    let agent_runtime = Arc::new(AgentRuntime::new());
    let config_source = Arc::new(StaticConfigSource(AgentRuntimeConfig::default()));
    let agent_service = AgentService::new(config_source, Arc::clone(&agent_runtime));
    let practice = Arc::new(PracticeService::new());
    let (tx, _rx) = broadcast::channel(DOMAIN_EVENT_CHANNEL_CAPACITY);
    let state = Arc::new(AppState::new(daemon, agent_runtime, agent_service, practice, tx));

    let router = build_router(state, &desktop_bff::BffConfig::default());
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
    let addr: SocketAddr = listener.local_addr().expect("addr");
    let server = tokio::spawn(async move {
        axum::serve(listener, router).await.expect("serve");
    });

    let resp = reqwest::Client::new()
        .request(reqwest::Method::OPTIONS, format!("http://{addr}/api/v1/daemon_status"))
        .header("Origin", "https://evil.example.com")
        .header("Access-Control-Request-Method", "POST")
        .send()
        .await
        .expect("preflight");
    assert!(
        !resp.headers().contains_key("access-control-allow-origin"),
        "default config must not echo an Access-Control-Allow-Origin header"
    );

    server.abort();
}

/// With explicit `allowed_origins`, the CORS layer is installed with
/// `allow_credentials(true)` and the SDK-style preflight succeeds.
#[tokio::test]
async fn explicit_allowlist_enables_credentialed_cors() {
    use axum::http::HeaderValue;

    let tmp = TempDir::new().expect("tempdir");
    let daemon = Arc::new(DaemonRuntime::new(DaemonRuntimeOptions::new(tmp.path())));
    let agent_runtime = Arc::new(AgentRuntime::new());
    let config_source = Arc::new(StaticConfigSource(AgentRuntimeConfig::default()));
    let agent_service = AgentService::new(config_source, Arc::clone(&agent_runtime));
    let practice = Arc::new(PracticeService::new());
    let (tx, _rx) = broadcast::channel(DOMAIN_EVENT_CHANNEL_CAPACITY);
    let state = Arc::new(AppState::new(daemon, agent_runtime, agent_service, practice, tx));

    let mut cfg = desktop_bff::BffConfig::default();
    cfg.allowed_origins = vec![HeaderValue::from_static("https://soma.example.com")];

    let router = build_router(state, &cfg);
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
    let addr: SocketAddr = listener.local_addr().expect("addr");
    let server = tokio::spawn(async move {
        axum::serve(listener, router).await.expect("serve");
    });

    // Allowed origin → echoed back, with credentials enabled.
    let resp = reqwest::Client::new()
        .request(reqwest::Method::OPTIONS, format!("http://{addr}/api/v1/daemon_status"))
        .header("Origin", "https://soma.example.com")
        .header("Access-Control-Request-Method", "POST")
        .header("Access-Control-Request-Headers", "content-type")
        .send()
        .await
        .expect("preflight");
    assert_eq!(
        resp.headers().get("access-control-allow-origin").map(|v| v.to_str().unwrap()),
        Some("https://soma.example.com")
    );
    assert_eq!(
        resp.headers().get("access-control-allow-credentials").map(|v| v.to_str().unwrap()),
        Some("true")
    );

    // Foreign origin → no allow-origin header echoed.
    let resp = reqwest::Client::new()
        .request(reqwest::Method::OPTIONS, format!("http://{addr}/api/v1/daemon_status"))
        .header("Origin", "https://evil.example.com")
        .header("Access-Control-Request-Method", "POST")
        .send()
        .await
        .expect("preflight foreign");
    assert!(
        resp.headers().get("access-control-allow-origin").is_none(),
        "foreign origin should not be echoed"
    );

    server.abort();
}
