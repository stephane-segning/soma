use crate::PeerEvent;
use crate::protocol::BLOB_CHUNK_BYTES;
use crate::runtime::RuntimeState;
use libp2p::{PeerId, request_response::ResponseChannel};
use soma_vdfs::{BlobRange, BlobRequest, BlobResponse, MAX_BLOB_MESSAGE_BYTES};

pub(super) async fn handle_blob_request(
    state: &mut RuntimeState,
    peer: PeerId,
    request: BlobRequest,
    channel: ResponseChannel<BlobResponse>,
) {
    if request.space_id.is_empty() {
        send_not_found(state, channel, request);
        emit_connection_error(state, peer, "blob request missing space_id");
        return;
    }

    if let Some(authorizer) = state.space_authorizer.as_ref() {
        if !authorizer.can_read_space(&peer, &request.space_id).await {
            send_not_found(state, channel, request);
            emit_connection_error(state, peer, "blob request denied (not a member)");
            return;
        }
    }

    let requested_len = if request.length == 0 {
        BLOB_CHUNK_BYTES
    } else {
        request.length as usize
    };
    let clamped_len = requested_len.min(MAX_BLOB_MESSAGE_BYTES.saturating_sub(1024));
    let range = BlobRange {
        offset: request.offset,
        length: Some(clamped_len),
    };

    if let Some(provider) = state.blob_provider.as_ref() {
        let res = provider
            .get(
                &request.cid,
                (!request.space_id.is_empty()).then_some(request.space_id.as_str()),
                range,
            )
            .await;
        let response = res.unwrap_or_else(|| not_found_response(request));
        let _ = state
            .swarm
            .behaviour_mut()
            .blob
            .send_response(channel, response);
    } else {
        send_not_found(state, channel, request);
        emit_connection_error(state, peer, "blob requested but no provider attached");
    }
}

fn send_not_found(
    state: &mut RuntimeState,
    channel: ResponseChannel<BlobResponse>,
    request: BlobRequest,
) {
    let _ = state
        .swarm
        .behaviour_mut()
        .blob
        .send_response(channel, not_found_response(request));
}

fn not_found_response(request: BlobRequest) -> BlobResponse {
    BlobResponse {
        cid: request.cid,
        mime: String::new(),
        size: 0,
        data: Vec::new(),
        found: false,
        space_id: request.space_id,
        offset: request.offset,
        eof: true,
    }
}

fn emit_connection_error(state: &RuntimeState, peer: PeerId, error: &str) {
    let _ = state.event_tx.try_send(PeerEvent::ConnectionError {
        peer: Some(peer),
        error: error.into(),
    });
}
