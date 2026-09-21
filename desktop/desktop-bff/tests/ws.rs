//! End-to-end coverage of the WebSocket event stream
//! (`desktop_bff::ws`), which replaces the old SSE endpoint. Covers the
//! handshake's two auth channels and confirms all three event sources
//! (renderer-sourced domain events, daemon-firehose-sourced domain
//! events, and agent-runtime events) reach one client over one
//! connection — the thing SSE never did (it only ever saw
//! renderer-sourced `DocumentChanged`).

mod support;

use std::time::Duration;

use desktop_agent::types::{AgentProvider, AgentRuntimeEvent};
use desktop_daemon::events::{DomainEvent, DomainEventSource};
use futures::StreamExt;
use support::{TEST_TOKEN, spawn_router, ws_base};
use tokio::sync::broadcast;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message as WsMessage;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::handshake::client::Request;

fn authed_request(url: &str, token: &str) -> Request {
    let mut request = url.into_client_request().expect("valid ws url");
    request
        .headers_mut()
        .insert("Authorization", format!("Bearer {token}").parse().expect("valid header value"));
    request
}

/// Polls `receiver_count()` rather than sleeping a fixed duration: the
/// WS handler subscribes to both broadcast channels synchronously (no
/// `.await` between the two `subscribe()` calls in `ws::handle_socket`),
/// so once the domain channel shows a subscriber the agent channel does
/// too — this confirms the *precondition* for a reliable send instead of
/// hoping a fixed sleep was long enough.
async fn wait_for_subscriber<T: Clone>(tx: &broadcast::Sender<T>) {
    tokio::time::timeout(Duration::from_secs(5), async {
        while tx.receiver_count() == 0 {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .expect("a WebSocket subscriber never showed up on the broadcast channel");
}

#[tokio::test]
async fn handshake_succeeds_with_correct_bearer_token() {
    let h = spawn_router().await;
    let url = format!("{}/api/v1/ws", ws_base(h.addr));
    let result = connect_async(authed_request(&url, TEST_TOKEN)).await;
    assert!(result.is_ok(), "expected handshake to succeed, got {:?}", result.err());
}

#[tokio::test]
async fn handshake_is_rejected_without_a_token() {
    let h = spawn_router().await;
    let url = format!("{}/api/v1/ws", ws_base(h.addr));
    let request = url.into_client_request().expect("valid ws url"); // no Authorization header
    let err = connect_async(request).await.expect_err("expected handshake to be rejected");
    assert_handshake_rejected_with_401(err);
}

#[tokio::test]
async fn handshake_is_rejected_with_wrong_token() {
    let h = spawn_router().await;
    let url = format!("{}/api/v1/ws", ws_base(h.addr));
    let err = connect_async(authed_request(&url, "wrong-token"))
        .await
        .expect_err("expected handshake to be rejected");
    assert_handshake_rejected_with_401(err);
}

fn assert_handshake_rejected_with_401(err: tokio_tungstenite::tungstenite::Error) {
    match err {
        tokio_tungstenite::tungstenite::Error::Http(resp) => {
            assert_eq!(resp.status(), 401, "expected 401, got {}", resp.status());
        }
        other => panic!("expected an HTTP handshake error, got {other:?}"),
    }
}

/// Covers the WebSocket subprotocol auth channel browsers must use (see
/// `desktop_bff::auth`'s module doc): the client offers `["bearer",
/// token]` as `Sec-WebSocket-Protocol` instead of an `Authorization`
/// header (which browsers cannot set on a WS handshake), and the server
/// must echo back `bearer` alone to complete negotiation per RFC 6455.
#[tokio::test]
async fn handshake_succeeds_via_websocket_subprotocol() {
    let h = spawn_router().await;
    let url = format!("{}/api/v1/ws", ws_base(h.addr));
    let mut request = url.into_client_request().expect("valid ws url");
    request.headers_mut().insert(
        "Sec-WebSocket-Protocol",
        format!("bearer, {TEST_TOKEN}").parse().expect("valid header value"),
    );
    let (_stream, response) = connect_async(request).await.expect("handshake should succeed");
    assert_eq!(
        response.headers().get("sec-websocket-protocol").map(|v| v.to_str().unwrap()),
        Some("bearer"),
        "server must echo the bearer subprotocol marker to complete negotiation"
    );
}

/// The heart of item 3 of the BFF hardening work: all three event
/// sources reach one client over one connection, each correctly
/// discriminated on the wire as `{"v":1,"channel":"domain"|"agent","event":{"kind":...}}`.
#[tokio::test]
async fn all_three_event_sources_arrive_over_one_connection() {
    let h = spawn_router().await;
    let url = format!("{}/api/v1/ws", ws_base(h.addr));
    let (mut socket, _response) = connect_async(authed_request(&url, TEST_TOKEN)).await.expect("handshake");

    wait_for_subscriber(&h.domain_events_tx).await;

    // A renderer-sourced domain event — what the old SSE stream already
    // carried.
    h.domain_events_tx
        .send(DomainEvent::DocumentChanged {
            source: DomainEventSource::Renderer,
            at_ms: 1_700_000_000_000,
            space_id: "space-1".into(),
            document_id: "doc-1".into(),
            reason: Some("ws-test".into()),
        })
        .expect("publish renderer-sourced event");

    // A daemon-firehose-sourced domain event. This is exactly the kind
    // that never reached the old SSE stream (only renderer-sourced
    // `DomainEvent`s did) — it now arrives on the same channel because
    // `desktop_daemon::events::spawn` publishes onto the same
    // `AppState::domain_events` sender instead of talking to a Tauri
    // `AppHandle` directly.
    h.domain_events_tx
        .send(DomainEvent::BotStatusChanged {
            space_id: "space-1".into(),
            delegate_peer_id: "peer-1".into(),
            status: "online".into(),
        })
        .expect("publish daemon-sourced event");

    // An agent-runtime-sourced event — the other source that never
    // reached SSE.
    h.agent_events_tx
        .send(AgentRuntimeEvent::Ready {
            at_ms: 1_700_000_000_000,
            provider: AgentProvider::OpenAiCompatible,
            base_url: "http://127.0.0.1:11434/v1".into(),
        })
        .expect("publish agent event");

    let mut seen_domain_renderer = false;
    let mut seen_domain_daemon = false;
    let mut seen_agent = false;

    tokio::time::timeout(Duration::from_secs(5), async {
        while !(seen_domain_renderer && seen_domain_daemon && seen_agent) {
            let msg = socket.next().await.expect("socket closed before all three event kinds arrived");
            let WsMessage::Text(text) = msg.expect("ws frame") else {
                continue;
            };
            let frame: serde_json::Value = serde_json::from_str(&text).expect("frame is valid json");
            assert_eq!(frame["v"], 1, "unexpected envelope version in {frame}");
            match (frame["channel"].as_str(), frame["event"]["kind"].as_str()) {
                (Some("domain"), Some("document-changed")) => seen_domain_renderer = true,
                (Some("domain"), Some("bot-status-changed")) => seen_domain_daemon = true,
                (Some("agent"), Some("ready")) => seen_agent = true,
                _ => {}
            }
        }
    })
    .await
    .expect("timed out waiting for all three event kinds");
}
