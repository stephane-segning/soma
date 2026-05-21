//! Renderer-source domain-event fan-out over Server-Sent Events.
//!
//! Each connected client gets a per-connection `broadcast::Receiver`. The
//! `Sender` side is owned by `AppState::domain_events`, the same channel
//! `desktop-api`'s handlers publish to (and which the Tauri shell drains
//! into `app.emit(DOMAIN_EVENT, ...)`). Behavior parity between the two
//! shells comes free.
//!
//! Wire shape:
//!
//! ```text
//! event: domain_event
//! data: {"kind":"document-changed","source":"renderer", ... }
//!
//! ```

use std::convert::Infallible;
use std::sync::Arc;
use std::time::Duration;

use axum::extract::State;
use axum::response::sse::{Event, KeepAlive, Sse};
use desktop_api::AppState;
use futures::stream::Stream;
use tokio_stream::StreamExt;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::wrappers::errors::BroadcastStreamRecvError;

pub async fn events_sse(
    State(app): State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = app.domain_events.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|res| match res {
        Ok(event) => match serde_json::to_string(&event) {
            Ok(json) => Some(Ok(Event::default().event("domain_event").data(json))),
            Err(err) => {
                // Should never happen: every `DomainEvent` variant is
                // serde-derived. We log instead of dropping the
                // connection so a single bad event doesn't kill SSE
                // for the renderer.
                tracing::warn!(?err, "domain_event serialize failed");
                None
            }
        },
        // `Lagged` means a slow consumer fell behind the channel
        // capacity (DOMAIN_EVENT_CHANNEL_CAPACITY in `desktop-api`).
        // Trace and continue; the dropped events would have been the
        // oldest, which matches the Tauri forwarder's behavior.
        Err(BroadcastStreamRecvError::Lagged(n)) => {
            tracing::warn!(dropped = n, "SSE consumer lagged");
            None
        }
    });

    Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keep-alive"),
    )
}
