//! `/soma/roster/1` runtime: moves bytes, verifies nothing.
//!
//! The rows crossing this protocol are signed claims about *third
//! parties*, so whether to believe one is a question only the daemon
//! can answer — it holds the pinned trust anchor and the peer-key
//! store. This module never inspects a row; it hands the opaque bytes
//! to [`RosterProvider`] and forwards whatever verdict comes back.
//!
//! One request, one response, no follow-up: a roster is small enough to
//! send whole, so there is no incremental state here to get wrong.

use crate::codec::{RosterRequest, RosterResponse};
use crate::runtime::RuntimeState;
use libp2p::PeerId;
use libp2p::request_response as reqres;
use tracing::{debug, trace};

pub(super) async fn handle_roster_event(
    state: &mut RuntimeState,
    event: reqres::Event<RosterRequest, RosterResponse>,
) {
    match event {
        reqres::Event::Message { peer, message, .. } => match message {
            reqres::Message::Request {
                request, channel, ..
            } => {
                let response = build_response(state, peer, request).await;
                let _ = state
                    .swarm
                    .behaviour_mut()
                    .roster
                    .send_response(channel, response);
            }
            reqres::Message::Response {
                request_id,
                response,
            } => {
                let Some(space_id) = state.outbound_rosters.remove(&request_id) else {
                    trace!(%peer, "roster response for an unknown request id, ignored");
                    return;
                };
                if !response.authorized {
                    debug!(%peer, %space_id, "roster refused by peer");
                    return;
                }
                if let Some(provider) = state.roster.clone() {
                    let learned = provider
                        .ingest_roster(&peer, &space_id, response.members)
                        .await;
                    if !learned.is_empty() {
                        let _ = state.event_tx.try_send(crate::PeerEvent::RosterLearned {
                            space_id,
                            peers: learned,
                        });
                    }
                }
            }
        },
        reqres::Event::OutboundFailure {
            peer,
            request_id,
            error,
            ..
        } => {
            state.outbound_rosters.remove(&request_id);
            debug!(%peer, %error, "roster request failed");
        }
        reqres::Event::InboundFailure { peer, error, .. } => {
            debug!(%peer, %error, "roster inbound failure");
        }
        reqres::Event::ResponseSent { .. } => {}
    }
}

async fn build_response(
    state: &mut RuntimeState,
    peer: PeerId,
    request: RosterRequest,
) -> RosterResponse {
    let refused = RosterResponse {
        authorized: false,
        members: Vec::new(),
    };
    if request.space_id.is_empty() {
        return refused;
    }
    let Some(provider) = state.roster.clone() else {
        return refused;
    };
    match provider.roster_for(&peer, &request.space_id).await {
        Some(members) => RosterResponse {
            authorized: true,
            members,
        },
        None => refused,
    }
}
