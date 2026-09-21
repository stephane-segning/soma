//! Unified event stream over WebSocket. Replaces the old SSE endpoint
//! (`GET /api/v1/events`, hard-cutover — no dual SSE+WS path) with `GET
//! /api/v1/ws`.
//!
//! ## Wire contract
//!
//! One WebSocket connection, authenticated the same way as every other
//! route (see `auth`), carries every event source this process knows
//! about, multiplexed into a single JSON envelope per text frame:
//!
//! ```json
//! {"v":1,"channel":"domain","event":{"kind":"document-changed","source":"renderer","atMs":1700000000000,"spaceId":"s1","documentId":"d1","reason":"upsert-draft"}}
//! {"v":1,"channel":"agent","event":{"kind":"status","atMs":1700000000000,"provider":"openai-compatible","baseUrl":"http://127.0.0.1:11434/v1","models":[]}}
//! ```
//!
//! - `v` — envelope version. `1` today; bump only on a breaking change to
//!   this outer shape (not for adding a new `DomainEvent`/`AgentRuntimeEvent`
//!   variant — those are additive and already tagged on `kind`).
//! - `channel` — which underlying broadcast channel produced the event:
//!   `"domain"` for `desktop_daemon::events::DomainEvent` (renderer
//!   mutations *and* the daemon firehose — joins, bot status, blob-added —
//!   now unified onto one channel, see `AppState::domain_events`'s doc
//!   comment) or `"agent"` for `desktop_agent::types::AgentRuntimeEvent`
//!   (`ready`/`status`/`error` from the agent runtime poll).
//! - `event` — the source's own already-tagged payload, verbatim. Each
//!   inner shape is unchanged from what the old SSE stream sent for
//!   `channel: "domain"` (`DomainEvent` was always tagged on `kind`), so a
//!   client that only cared about domain events needs no new parsing
//!   logic beyond reading `.event` instead of the top-level object.
//!
//! `channel`/`event` use adjacent tagging (`content = "event"`) rather
//! than flattening the inner payload into the envelope, specifically to
//! avoid a key collision: several `DomainEvent` variants already have a
//! field named `source` (`DomainEventSource::Renderer` /`::Daemon`), which
//! would collide with an outer `source`-named discriminator under
//! internal tagging.
//!
//! ## Authentication
//!
//! See `auth`'s module doc for the full channel list (`Authorization`
//! header, or `Sec-WebSocket-Protocol: bearer, <token>` for browsers).
//! Rejection happens in middleware *before* the WebSocket upgrade — an
//! unauthenticated client gets a plain HTTP 401 and the handshake never
//! completes; it does not see a 101 followed by an immediate close.
//!
//! ## Keepalive and shutdown
//!
//! The server sends a WebSocket-protocol `Ping` every 30s; axum answers
//! client-initiated pings automatically (no application code needed on
//! either side — this is transport-level, not a JSON frame). A `Ping`
//! send failure (or any send/receive error) closes the connection from
//! the server's side. On process shutdown, `main.rs` flips a
//! `tokio::sync::watch` bool that every open connection observes,
//! sending a clean WebSocket `Close` frame before the task exits — so
//! `somad`/`desktop-bff` restarts don't look like a network failure to
//! connected clients.
//!
//! ## Backpressure
//!
//! Each connection holds its own `broadcast::Receiver` per channel. A
//! consumer that falls behind the channel's capacity
//! (`DOMAIN_EVENT_CHANNEL_CAPACITY` / `AGENT_EVENT_CHANNEL_CAPACITY`)
//! observes `RecvError::Lagged` — logged and skipped, matching the old
//! SSE behavior, rather than closing the connection. The dropped events
//! are always the *oldest*.

use std::sync::Arc;
use std::time::Duration;

use axum::body::Bytes;
use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade, close_code};
use axum::extract::{Extension, State};
use axum::response::Response;
use axum::routing::MethodRouter;
use desktop_agent::types::AgentRuntimeEvent;
use desktop_api::AppState;
use desktop_daemon::events::DomainEvent;
use serde::Serialize;
use tokio::sync::{broadcast, watch};
use tokio::time::MissedTickBehavior;

use crate::auth::WS_AUTH_SUBPROTOCOL;
use crate::state::ShutdownSignal;

/// How often the server pings an idle connection to detect a dead peer
/// faster than waiting for a write to fail outright (useful behind NATs /
/// proxies that silently drop idle connections).
const PING_INTERVAL: Duration = Duration::from_secs(30);

const ENVELOPE_VERSION: u8 = 1;

#[derive(Debug, Clone, Serialize)]
struct WsFrame<'a> {
    v: u8,
    #[serde(flatten)]
    payload: &'a WsEventPayload,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "channel", content = "event", rename_all = "kebab-case")]
enum WsEventPayload {
    Domain(DomainEvent),
    Agent(AgentRuntimeEvent),
}

/// `Clone`able shutdown signal shared by every open connection. `main.rs`
/// flips it once on the first shutdown signal; `state::ShutdownSignal` is
/// the `Extension`-wrapped newtype handlers actually extract.
pub type ShutdownRx = watch::Receiver<bool>;

pub async fn events_ws(
    State(app): State<Arc<AppState>>,
    Extension(ShutdownSignal(shutdown)): Extension<ShutdownSignal>,
    ws: WebSocketUpgrade,
) -> Response {
    // Echo the `bearer` subprotocol marker back if the client offered it,
    // completing negotiation for browser clients that authenticated via
    // `Sec-WebSocket-Protocol` (see `auth`'s module doc). Clients that
    // authenticated via the `Authorization` header simply won't have
    // offered a subprotocol, so this is a no-op for them.
    ws.protocols([WS_AUTH_SUBPROTOCOL])
        .on_upgrade(move |socket| handle_socket(socket, app, shutdown))
}

/// Exposed so `routes::router()` can mount this without importing
/// `axum::routing::any` itself — see the doc comment there for why `any`
/// (not `get`) is required for WebSocket routes.
pub fn route() -> MethodRouter<Arc<AppState>> {
    axum::routing::any(events_ws)
}

async fn handle_socket(mut socket: WebSocket, app: Arc<AppState>, mut shutdown: ShutdownRx) {
    let mut domain_rx = app.domain_events.subscribe();
    let mut agent_rx = app.agent_events.subscribe();

    let mut ping_interval = tokio::time::interval(PING_INTERVAL);
    ping_interval.set_missed_tick_behavior(MissedTickBehavior::Delay);
    ping_interval.tick().await; // the first tick fires immediately; skip it

    loop {
        tokio::select! {
            incoming = socket.recv() => {
                match incoming {
                    // Client closed, or the connection dropped. axum
                    // already answers a client `Close` with one of its
                    // own when necessary; we just stop looping.
                    None | Some(Ok(Message::Close(_))) => break,
                    // Text/Binary/Ping/Pong: this stream is server→client
                    // only (no client-initiated commands in v1). Ping is
                    // auto-answered by axum; anything else is ignored.
                    Some(Ok(_)) => {}
                    Some(Err(err)) => {
                        tracing::debug!(?err, "ws recv error; closing connection");
                        break;
                    }
                }
            }
            _ = ping_interval.tick() => {
                if socket.send(Message::Ping(Bytes::new())).await.is_err() {
                    break;
                }
            }
            domain = domain_rx.recv() => {
                match domain {
                    Ok(event) => {
                        if send_frame(&mut socket, &WsEventPayload::Domain(event)).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!(dropped = n, "ws consumer lagged on domain_events");
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            agent = agent_rx.recv() => {
                match agent {
                    Ok(event) => {
                        if send_frame(&mut socket, &WsEventPayload::Agent(event)).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!(dropped = n, "ws consumer lagged on agent_events");
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            // Process-wide shutdown (see the module doc's "Keepalive and
            // shutdown" section). `changed()` only resolves on an actual
            // transition, so this fires once per connection lifetime.
            changed = shutdown.changed() => {
                match changed {
                    Ok(()) if *shutdown.borrow() => {
                        let _ = socket
                            .send(Message::Close(Some(CloseFrame {
                                code: close_code::AWAY,
                                reason: "server shutting down".into(),
                            })))
                            .await;
                        break;
                    }
                    Ok(()) => {} // observed a change, but not to `true` — keep serving.
                    Err(_) => {
                        // The sender was dropped without signaling
                        // shutdown. Treat it the same as a shutdown
                        // request rather than looping on an
                        // always-ready future.
                        break;
                    }
                }
            }
        }
    }
}

async fn send_frame(socket: &mut WebSocket, payload: &WsEventPayload) -> Result<(), ()> {
    let frame = WsFrame {
        v: ENVELOPE_VERSION,
        payload,
    };
    let json = match serde_json::to_string(&frame) {
        Ok(json) => json,
        Err(err) => {
            // Should never happen: every variant is serde-derived. Log
            // and skip rather than killing the connection over one bad
            // event, matching the old SSE handler's behavior.
            tracing::warn!(?err, "ws event serialize failed");
            return Ok(());
        }
    };
    socket.send(Message::text(json)).await.map_err(|_| ())
}
