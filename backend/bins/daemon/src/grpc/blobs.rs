use soma_proto_build::daemon;
use soma_storage::blobs::BlobMetadata;
use tonic::{Request, Response, Status};
use tracing::warn;

use crate::services::blobs::BlobsService;

use super::{
    mappers::{now_ms, to_blob_metadata},
    DaemonService,
};

const MAX_UPLOAD_BYTES: usize = 8 * 1024 * 1024;

impl DaemonService {
    pub(super) async fn upload_blob_response(
        &self,
        request: Request<daemon::UploadBlobRequest>,
    ) -> Result<Response<daemon::UploadBlobResponse>, Status> {
        let payload = request.into_inner();
        if payload.space_id.is_empty() {
            return Err(Status::invalid_argument("space_id required"));
        }
        self.ensure_membership(&payload.space_id).await?;
        if payload.data.is_empty() {
            return Err(Status::invalid_argument("data required"));
        }
        if payload.data.len() > MAX_UPLOAD_BYTES {
            return Err(Status::invalid_argument("blob too large"));
        }

        let mime = if payload.mime.is_empty() {
            "application/octet-stream".to_string()
        } else {
            payload.mime.clone()
        };
        let write_res = self
            .state
            .blob_store
            .write_local(&payload.space_id, &payload.data)
            .await
            .map_err(|err| {
                warn!(%err, "failed to persist blob");
                Status::internal("failed to persist blob")
            })?;

        let now = now_ms();
        let blob_metadata = BlobMetadata {
            space_id: payload.space_id.clone(),
            cid: write_res.cid.clone(),
            size: write_res.size as i64,
            mime: mime.clone(),
            name: payload.name.clone(),
            created_at_ms: now,
            last_seen_ms: now,
        };
        let doc_id = if payload.doc_id.is_empty() {
            None
        } else {
            Some(payload.doc_id.as_str())
        };
        BlobsService::new(self.state.repos.clone())
            .record_upload(&blob_metadata, doc_id)
            .await
            .map_err(|err| {
                warn!(%err, "failed to persist blob metadata");
                Status::internal("failed to persist blob metadata")
            })?;

        if !payload.doc_id.is_empty() {
            self.publish_document_blob_added(&payload, &write_res.cid, write_res.size, &mime)
                .await;
        }

        Ok(Response::new(daemon::UploadBlobResponse {
            cid: write_res.cid,
            size: write_res.size,
            mime,
            name: payload.name,
        }))
    }

    pub(super) async fn read_blob_response(
        &self,
        request: Request<daemon::ReadBlobRequest>,
    ) -> Result<Response<daemon::ReadBlobResponse>, Status> {
        let payload = request.into_inner();
        if payload.space_id.is_empty() {
            return Err(Status::invalid_argument("space_id required"));
        }
        if payload.cid.is_empty() {
            return Err(Status::invalid_argument("cid required"));
        }
        self.ensure_membership(&payload.space_id).await?;

        let Some(bytes) = self
            .state
            .blob_store
            .read(&payload.space_id, &payload.cid)
            .await
            .map_err(|err| {
                warn!(%err, "read_blob failed");
                Status::internal("failed to read blob")
            })?
        else {
            return Err(Status::not_found("blob not found"));
        };

        if bytes.len() > MAX_UPLOAD_BYTES {
            return Err(Status::resource_exhausted("blob too large"));
        }

        let mime = self.blob_mime_or_default(&payload.space_id, &payload.cid).await;
        Ok(Response::new(daemon::ReadBlobResponse {
            size: bytes.len() as u64,
            data: bytes,
            mime,
        }))
    }

    pub(super) async fn get_blob_metadata_response(
        &self,
        request: Request<daemon::GetBlobMetadataRequest>,
    ) -> Result<Response<daemon::GetBlobMetadataResponse>, Status> {
        let payload = request.into_inner();
        if payload.space_id.is_empty() {
            return Err(Status::invalid_argument("space_id required"));
        }
        if payload.cid.is_empty() {
            return Err(Status::invalid_argument("cid required"));
        }
        self.ensure_membership(&payload.space_id).await?;

        let blob = BlobsService::new(self.state.repos.clone())
            .get_metadata(&payload.space_id, &payload.cid)
            .await
            .map_err(|err| {
                warn!(%err, "get_blob_metadata failed");
                Status::internal("failed to fetch blob metadata")
            })?;

        let Some(blob) = blob else {
            return Err(Status::not_found("blob metadata not found"));
        };

        Ok(Response::new(daemon::GetBlobMetadataResponse {
            blob: Some(to_blob_metadata(blob)),
        }))
    }

    pub(super) async fn list_blobs_response(
        &self,
        request: Request<daemon::ListBlobsRequest>,
    ) -> Result<Response<daemon::ListBlobsResponse>, Status> {
        let payload = request.into_inner();
        if payload.space_id.is_empty() {
            return Err(Status::invalid_argument("space_id required"));
        }
        self.ensure_membership(&payload.space_id).await?;

        let document_id = if payload.document_id.trim().is_empty() {
            None
        } else {
            Some(payload.document_id.as_str())
        };
        let blobs = BlobsService::new(self.state.repos.clone())
            .list_blobs(
                &payload.space_id,
                document_id,
                if payload.limit == 0 { 100 } else { payload.limit },
                payload.offset,
            )
            .await
            .map_err(|err| {
                warn!(%err, "list_blobs failed");
                Status::internal("failed to list blobs")
            })?;

        Ok(Response::new(daemon::ListBlobsResponse {
            blobs: blobs.into_iter().map(to_blob_metadata).collect(),
        }))
    }
}
