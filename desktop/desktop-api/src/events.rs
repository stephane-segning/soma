//! Renderer-source domain-event publishing for `desktop-api` handlers.
//!
//! Handlers call [`publish`] after a successful mutation. The event lands
//! on `AppState::domain_events`; each presenter (Tauri's `app.emit`, the
//! BFF's SSE channel) drains the same broadcast channel so both shells
//! agree on what the renderer hears.
//!
//! Why a free function rather than a method on `AppState`: keeps `state.rs`
//! free of `DomainEvent` construction logic and lets us swap in tracing
//! around the publish site without threading a logger through every
//! handler.

use desktop_daemon::events::{DomainEvent, DomainEventSource};

use crate::state::AppState;

/// Broadcast a domain event sourced at the renderer. Soft-fails if the
/// channel has no subscribers — that's the normal startup window before
/// any presenter has installed its forwarder. Errors only when the
/// channel is closed, which would mean the host process is shutting
/// down; we trace it but don't propagate so handlers can stay infallible
/// from the renderer's perspective.
pub fn publish(state: &AppState, event: DomainEvent) {
    if let Err(err) = state.domain_events.send(event) {
        // `send` returns `Err` when the channel is closed (no receivers
        // and the underlying buffer was dropped). At that point we're
        // either shutting down or the presenter hasn't installed its
        // forwarder yet — neither is fatal, but worth tracing.
        tracing::debug!(?err, "domain-event publish dropped: channel closed or no subscribers yet");
    }
}

/// Convenience constructor for the `document-changed` event with
/// `source: renderer`. Every renderer-triggered document mutation
/// (`upsert_draft`, `queue_daemon_sync`, `sync_published`) emits this,
/// so it deserves its own helper.
pub fn document_changed(space_id: String, document_id: String, reason: &'static str) -> DomainEvent {
    DomainEvent::DocumentChanged {
        source: DomainEventSource::Renderer,
        at_ms: desktop_core::time::now_ms(),
        space_id,
        document_id,
        reason: Some(reason.into()),
    }
}

/// Convenience constructor for the `pages-changed` event with
/// `source: renderer`. Triggered after ensure/update/set-parents.
#[allow(dead_code)] // wired up alongside the pages-source broadcasts in a follow-up
pub fn pages_changed(space_id: String, reason: &'static str) -> DomainEvent {
    DomainEvent::PagesChanged {
        source: DomainEventSource::Renderer,
        at_ms: desktop_core::time::now_ms(),
        space_id,
        reason: Some(reason.into()),
    }
}
