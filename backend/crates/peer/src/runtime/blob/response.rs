use super::emit_connection_error;
use super::streaming::{abort_download, begin_streaming_write};
use crate::PeerEvent;
use crate::runtime::RuntimeState;
use libp2p::PeerId;
use soma_vdfs::{BlobProvider, BlobRequest, BlobResponse, MAX_BLOB_MESSAGE_BYTES};
use std::sync::Arc;
use tokio::sync::mpsc;

pub(super) async fn handle_blob_response(
    state: &mut RuntimeState,
    peer: PeerId,
    response: BlobResponse,
) {
    if !response.found {
        emit_blob_received(state, &response, false, false);
        return;
    }

    let space_id = response.space_id.clone();
    if space_id.is_empty() {
        emit_connection_error(state, Some(peer), "blob response missing space_id");
        emit_blob_received(state, &response, true, false);
        return;
    }

    let chunk_len = response.data.len() as u64;
    if chunk_len == 0 {
        emit_connection_error(state, Some(peer), "blob response with empty chunk");
        return;
    }

    let is_single_chunk = response.offset == 0
        && chunk_len == response.size
        && chunk_len as usize <= MAX_BLOB_MESSAGE_BYTES;
    if is_single_chunk {
        let Some(provider) = state.blob_provider.clone() else {
            emit_blob_received(state, &response, true, false);
            return;
        };
        let stored =
            store_single_chunk(provider, state.event_tx.clone(), peer, &response, &space_id).await;
        emit_blob_received(state, &response, true, stored);
        return;
    }

    if state.blob_provider.is_none() {
        emit_connection_error(state, Some(peer), "blob response but no provider attached");
        emit_blob_received(state, &response, true, false);
        return;
    }

    let key = (space_id.clone(), response.cid.clone());
    if !state.blob_downloads.contains_key(&key)
        && !begin_streaming_write(state, peer, &response, &space_id, key.clone()).await
    {
        return;
    }

    let Some(expected_offset) = state.blob_downloads.get(&key).map(|d| d.next_offset) else {
        return;
    };
    if expected_offset != response.offset {
        abort_download(state, &key).await;
        emit_connection_error(state, Some(peer), "received out-of-order blob chunk");
        emit_blob_received(state, &response, true, false);
        return;
    }

    let write_result = state
        .blob_downloads
        .get_mut(&key)
        .expect("download checked")
        .writer
        .write_chunk(response.offset, &response.data)
        .await;
    if let Err(err) = write_result {
        abort_download(state, &key).await;
        emit_connection_error(
            state,
            Some(peer),
            format!("failed to persist blob chunk: {err}"),
        );
        emit_blob_received(state, &response, true, false);
        return;
    }

    let download = state
        .blob_downloads
        .get_mut(&key)
        .expect("download checked");
    download.next_offset += chunk_len;
    let done = download.next_offset >= download.total_size || response.eof;
    let (next_offset, chunk_size) = (download.next_offset, download.chunk_size);

    if done {
        if let Some(download) = state.blob_downloads.remove(&key) {
            let stored = download.writer.finish().await.unwrap_or(false);
            emit_blob_received(state, &response, true, stored);
        }
    } else {
        request_next_chunk(state, peer, response, space_id, next_offset, chunk_size);
    }
}

async fn store_single_chunk(
    provider: Arc<dyn BlobProvider>,
    event_tx: mpsc::Sender<PeerEvent>,
    peer: PeerId,
    response: &BlobResponse,
    space_id: &str,
) -> bool {
    match provider
        .put(
            &response.cid,
            Some(space_id),
            &response.data,
            &response.mime,
        )
        .await
    {
        Ok(written) => written,
        Err(err) => {
            let _ = event_tx.try_send(PeerEvent::ConnectionError {
                peer: Some(peer),
                error: format!("blob store failed: {err}"),
            });
            false
        }
    }
}

fn request_next_chunk(
    state: &mut RuntimeState,
    peer: PeerId,
    response: BlobResponse,
    space_id: String,
    next_offset: u64,
    chunk_size: u32,
) {
    let next_len = chunk_size.min(MAX_BLOB_MESSAGE_BYTES.saturating_sub(1024) as u32);
    let next_request = BlobRequest {
        cid: response.cid,
        space_id,
        offset: next_offset,
        length: next_len,
    };
    let _ = state
        .swarm
        .behaviour_mut()
        .blob
        .send_request(&peer, next_request);
}

fn emit_blob_received(state: &RuntimeState, response: &BlobResponse, found: bool, stored: bool) {
    let _ = state.event_tx.try_send(PeerEvent::BlobResponseReceived {
        cid: response.cid.clone(),
        size: response.size,
        found,
        stored,
    });
}
