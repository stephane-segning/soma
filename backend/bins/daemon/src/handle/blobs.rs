use soma_core::SomaResult;
use soma_proto_build::daemon;
use soma_storage::blobs::BlobMetadata;
use tracing::info;

use crate::services::blobs::BlobsService;

use super::{
    DaemonHandle, invalid, now_ms,
    types::{ReadBlobResult, UploadBlobInput, UploadBlobResult},
};

const MAX_UPLOAD_BYTES: usize = 8 * 1024 * 1024;

impl DaemonHandle {
    pub async fn upload_blob(&self, input: UploadBlobInput) -> SomaResult<UploadBlobResult> {
        let UploadBlobInput {
            space_id,
            data,
            mime,
            name,
            doc_id,
        } = input;

        if space_id.is_empty() {
            return Err(invalid("space_id required"));
        }
        super::ensure_membership(&self.state, &space_id).await?;
        if data.is_empty() {
            return Err(invalid("data required"));
        }
        if data.len() > MAX_UPLOAD_BYTES {
            return Err(invalid("blob too large"));
        }

        let mime = if mime.is_empty() {
            "application/octet-stream".to_string()
        } else {
            mime
        };

        let write_res = self.state.blob_store.write_local(&space_id, &data).await?;

        let now = now_ms();
        let blob_metadata = BlobMetadata {
            space_id: space_id.clone(),
            cid: write_res.cid.clone(),
            size: write_res.size as i64,
            mime: mime.clone(),
            name: name.clone(),
            created_at_ms: now,
            last_seen_ms: now,
        };
        let doc_id_ref = if doc_id.is_empty() {
            None
        } else {
            Some(doc_id.as_str())
        };
        BlobsService::new(self.state.repos.clone())
            .record_upload(&blob_metadata, doc_id_ref)
            .await?;

        // Mirror the gRPC path: when the upload is associated with a Yoopta
        // document (non-empty doc_id), publish DocumentBlobAdded so subscribers
        // and downstream peer/cache workflows see the same event regardless of
        // whether the upload came in via the addon or via gRPC.
        if let Some(doc_id) = doc_id_ref {
            self.state
                .publish(daemon::DaemonEvent {
                    event: Some(daemon::daemon_event::Event::DocumentBlobAdded(
                        daemon::DocumentBlobAddedEvent {
                            space_id: space_id.clone(),
                            doc_id: doc_id.to_string(),
                            cid: write_res.cid.clone(),
                            mime: mime.clone(),
                            size: write_res.size,
                            name: name.clone(),
                        },
                    )),
                })
                .await;
            info!(
                %space_id, %doc_id, cid = %write_res.cid, size = write_res.size,
                "document blob stored (in-process)"
            );
        }

        Ok(UploadBlobResult {
            cid: write_res.cid,
            size: write_res.size,
            mime,
            name,
        })
    }

    pub async fn read_blob(
        &self,
        space_id: &str,
        cid: &str,
    ) -> SomaResult<Option<ReadBlobResult>> {
        if space_id.is_empty() {
            return Err(invalid("space_id required"));
        }
        if cid.is_empty() {
            return Err(invalid("cid required"));
        }
        super::ensure_membership(&self.state, space_id).await?;

        // Read intentionally has no size cap: MAX_UPLOAD_BYTES gates ingress
        // only. Blobs created under a higher historical limit (or by another
        // client) must still be readable; and by the time we get here the
        // bytes are already in memory anyway, so a cap would be useless as
        // a memory-exhaustion mitigation.
        let Some(bytes) = self.state.blob_store.read(space_id, cid).await? else {
            return Ok(None);
        };

        let mime = BlobsService::new(self.state.repos.clone())
            .get_metadata(space_id, cid)
            .await
            .ok()
            .flatten()
            .map(|m| m.mime)
            .filter(|m| !m.is_empty())
            .unwrap_or_else(|| "application/octet-stream".to_string());

        let size = bytes.len() as u64;
        Ok(Some(ReadBlobResult {
            data: bytes,
            size,
            mime,
        }))
    }
}
