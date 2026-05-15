use super::emit_connection_error;
use crate::PeerEvent;
use crate::protocol::BLOB_CHUNK_BYTES;
use crate::runtime::{BlobDownloadState, RuntimeState};
use libp2p::PeerId;
use soma_vdfs::{BlobResponse, BlobWriteInit};

pub(super) async fn begin_streaming_write(
    state: &mut RuntimeState,
    peer: PeerId,
    response: &BlobResponse,
    space_id: &str,
    key: (String, String),
) -> bool {
    let Some(provider) = state.blob_provider.as_ref() else {
        return false;
    };

    match provider
        .open_streaming_put(&response.cid, Some(space_id), response.size)
        .await
    {
        Ok(Some(BlobWriteInit::AlreadyPresent)) => {
            emit_blob_received(state, response, true, true);
            false
        }
        Ok(Some(BlobWriteInit::Started(writer))) => {
            state.blob_downloads.insert(
                key,
                BlobDownloadState {
                    writer,
                    total_size: response.size,
                    next_offset: 0,
                    chunk_size: BLOB_CHUNK_BYTES as u32,
                },
            );
            true
        }
        Ok(None) => {
            emit_connection_error(
                state,
                Some(peer),
                "blob provider does not support streaming writes",
            );
            emit_blob_received(state, response, true, false);
            false
        }
        Err(err) => {
            emit_connection_error(
                state,
                Some(peer),
                format!("failed to begin streaming blob write: {err}"),
            );
            emit_blob_received(state, response, true, false);
            false
        }
    }
}

pub(super) async fn abort_download(state: &mut RuntimeState, key: &(String, String)) {
    if let Some(writer) = state.blob_downloads.remove(key).map(|s| s.writer) {
        let _ = writer.abort().await;
    }
}

fn emit_blob_received(state: &RuntimeState, response: &BlobResponse, found: bool, stored: bool) {
    let _ = state.event_tx.try_send(PeerEvent::BlobResponseReceived {
        cid: response.cid.clone(),
        size: response.size,
        found,
        stored,
    });
}
