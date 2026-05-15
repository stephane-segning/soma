use soma_proto_build::daemon;
use soma_storage::documents::Document;
use tonic::{Request, Response, Status};
use tracing::warn;

use crate::services::documents::DocumentsService;

use super::DaemonService;

impl DaemonService {
    pub(super) async fn upsert_document_response(
        &self,
        request: Request<daemon::UpsertDocumentRequest>,
    ) -> Result<Response<daemon::UpsertDocumentResponse>, Status> {
        let payload = request.into_inner();
        if payload.space_id.is_empty() {
            return Err(Status::invalid_argument("space_id required"));
        }
        self.ensure_membership(&payload.space_id).await?;
        if payload.document_id.is_empty() {
            return Err(Status::invalid_argument("document_id required"));
        }
        if payload.content_json.is_empty() {
            return Err(Status::invalid_argument("content_json required"));
        }

        let document = Document {
            space_id: payload.space_id,
            document_id: payload.document_id,
            content_json: payload.content_json,
            published: payload.published,
            updated_at_ms: payload.updated_at_ms,
        };

        DocumentsService::new(self.state.repos.clone())
            .upsert(&document)
            .await
            .map_err(|err| {
                warn!(%err, "upsert_document failed");
                Status::internal("failed to upsert document")
            })?;

        Ok(Response::new(daemon::UpsertDocumentResponse { ok: true }))
    }

    pub(super) async fn get_document_response(
        &self,
        request: Request<daemon::GetDocumentRequest>,
    ) -> Result<Response<daemon::GetDocumentResponse>, Status> {
        let payload = request.into_inner();
        if payload.space_id.is_empty() {
            return Err(Status::invalid_argument("space_id required"));
        }
        self.ensure_membership(&payload.space_id).await?;
        if payload.document_id.is_empty() {
            return Err(Status::invalid_argument("document_id required"));
        }

        let document = DocumentsService::new(self.state.repos.clone())
            .get(&payload.space_id, &payload.document_id)
            .await
            .map_err(|err| {
                warn!(%err, "get_document failed");
                Status::internal("failed to fetch document")
            })?;

        let Some(document) = document else {
            return Err(Status::not_found("document not found"));
        };

        Ok(Response::new(daemon::GetDocumentResponse {
            space_id: document.space_id,
            document_id: document.document_id,
            content_json: document.content_json,
            published: document.published,
            updated_at_ms: document.updated_at_ms,
        }))
    }
}
