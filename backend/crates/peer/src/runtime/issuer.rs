//! Runtime handler for the `/soma/issuer-offer/1` request_response
//! protocol. Mirrors the join-decision pattern in `runtime/join.rs`:
//!
//! - Owner side: outbound offers correlate to `outbound_issuer_offers`.
//!   On `Message::Response` we fire `IssuerOfferAckReceived`; on
//!   `OutboundFailure` we fire `IssuerOfferDeliveryFailed`. The daemon
//!   handler (`backend/crates/daemon/src/handlers/issuer_events.rs`)
//!   translates those into persistent status transitions.
//! - Delegate side: on `Message::Request` we auto-ACK and fire
//!   `IssuerOfferReceived` for observability. Capability signature
//!   validation happens daemon-side via the existing
//!   `validate_issuer_capability` helper; the codec layer just moves
//!   bytes.
use crate::PeerEvent;
use crate::codec::IssuerCapabilityAck;
use crate::runtime::RuntimeState;
use libp2p::request_response as reqres;
use soma_proto_build::space;

pub(super) async fn handle_issuer_offer_event(
    state: &mut RuntimeState,
    event: reqres::Event<space::IssuerCapability, IssuerCapabilityAck>,
) {
    match event {
        reqres::Event::Message { peer, message, .. } => match message {
            reqres::Message::Request {
                request, channel, ..
            } => {
                let space_id = request
                    .space_id
                    .as_ref()
                    .map(|s| s.value.clone())
                    .unwrap_or_default();
                let _ = state
                    .swarm
                    .behaviour_mut()
                    .issuer_offer
                    .send_response(channel, IssuerCapabilityAck {});
                let _ = state.event_tx.try_send(PeerEvent::IssuerOfferReceived {
                    from: peer,
                    space_id,
                });
            }
            reqres::Message::Response { request_id, .. } => {
                if let Some((target, delivery_id, space_id)) =
                    state.outbound_issuer_offers.remove(&request_id)
                {
                    let _ = state.event_tx.try_send(PeerEvent::IssuerOfferAckReceived {
                        target,
                        delivery_id,
                        space_id,
                    });
                }
            }
        },
        reqres::Event::OutboundFailure {
            peer,
            request_id,
            error,
            ..
        } => {
            if let Some((_target, delivery_id, space_id)) =
                state.outbound_issuer_offers.remove(&request_id)
            {
                let _ = state
                    .event_tx
                    .try_send(PeerEvent::IssuerOfferDeliveryFailed {
                        target: peer,
                        delivery_id,
                        space_id,
                        error: error.to_string(),
                    });
            }
        }
        reqres::Event::InboundFailure { .. } => {}
        reqres::Event::ResponseSent { .. } => {}
    }
}
