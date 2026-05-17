use std::time::{SystemTime, UNIX_EPOCH};

use soma_core::SomaResult;
use soma_storage::blobs::BlobMetadata;

use crate::services::blobs::BlobsService;

use super::{
    DaemonHandle, invalid,
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

        let Some(bytes) = self.state.blob_store.read(space_id, cid).await? else {
            return Ok(None);
        };

        if bytes.len() > MAX_UPLOAD_BYTES {
            return Err(invalid("blob too large"));
        }

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

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}
