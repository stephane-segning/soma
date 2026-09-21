//! Runtime handler for the `/soma/blob-announce/1` request_response
//! protocol. Mirrors `runtime/issuer.rs`'s pattern: auto-ACK inbound
//! announces immediately (nothing to validate — an announce is just a
//! hint, not a trust decision) and surface a [`PeerEvent::BlobAnnounceReceived`]
//! for downstream handlers (e.g. a mirror bot enqueueing a fetch) to react
//! to. Outbound announces are fire-and-forget: nothing in this runtime
//! tracks them, so `Message::Response` / failures are logged only.

use crate::PeerEvent;
use crate::codec::{BlobAnnounce, BlobAnnounceAck};
use crate::runtime::RuntimeState;
use libp2p::PeerId;
use libp2p::request_response as reqres;
use tracing::trace;

pub(super) async fn handle_blob_announce_event(
    state: &mut RuntimeState,
    event: reqres::Event<BlobAnnounce, BlobAnnounceAck>,
) {
    match event {
        reqres::Event::Message { peer, message, .. } => match message {
            reqres::Message::Request {
                request, channel, ..
            } => {
                let _ = state
                    .swarm
                    .behaviour_mut()
                    .blob_announce
                    .send_response(channel, BlobAnnounceAck {});
                emit_announce_received(state, peer, request);
            }
            reqres::Message::Response { .. } => {
                trace!(%peer, "blob announce acked");
            }
        },
        reqres::Event::OutboundFailure { peer, error, .. } => {
            trace!(%peer, %error, "blob announce delivery failed (best-effort, ignored)");
        }
        reqres::Event::InboundFailure { peer, error, .. } => {
            trace!(%peer, %error, "blob announce inbound failure");
        }
        reqres::Event::ResponseSent { .. } => {}
    }
}

fn emit_announce_received(state: &RuntimeState, from: PeerId, announce: BlobAnnounce) {
    if announce.space_id.is_empty() || announce.cid.is_empty() {
        return;
    }
    let _ = state.event_tx.try_send(PeerEvent::BlobAnnounceReceived {
        from,
        space_id: announce.space_id,
        cid: announce.cid,
        mime: announce.mime,
        size: announce.size,
    });
}
