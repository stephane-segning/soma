mod request;
mod response;
mod streaming;

use crate::runtime::RuntimeState;
use libp2p::PeerId;
use libp2p::request_response as reqres;
use soma_vdfs::{BlobRequest, BlobResponse};

pub(super) async fn handle_blob_event(
    state: &mut RuntimeState,
    event: reqres::Event<BlobRequest, BlobResponse>,
) {
    match event {
        reqres::Event::Message { peer, message, .. } => match message {
            reqres::Message::Request {
                request, channel, ..
            } => request::handle_blob_request(state, peer, request, channel).await,
            reqres::Message::Response { response, .. } => {
                response::handle_blob_response(state, peer, response).await;
            }
        },
        reqres::Event::OutboundFailure { peer, error, .. } => {
            emit_connection_error(state, Some(peer), format!("blob outbound failure: {error}"));
        }
        reqres::Event::InboundFailure { peer, error, .. } => {
            emit_connection_error(state, Some(peer), format!("blob inbound failure: {error}"));
        }
        reqres::Event::ResponseSent { .. } => {}
    }
}

pub(crate) fn emit_connection_error(
    state: &RuntimeState,
    peer: Option<PeerId>,
    error: impl Into<String>,
) {
    let _ = state.event_tx.try_send(crate::PeerEvent::ConnectionError {
        peer,
        error: error.into(),
    });
}
