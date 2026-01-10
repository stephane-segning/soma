use std::sync::Arc;

use soma_core::SomaResult;
use soma_storage::{
    RepositoryProvider,
    blobs::{BlobMetadata, BlobRef},
};

#[derive(Clone)]
pub struct BlobsService {
    repos: Arc<dyn RepositoryProvider>,
}

impl BlobsService {
    pub fn new(repos: Arc<dyn RepositoryProvider>) -> Self {
        Self { repos }
    }

    pub async fn record_upload(&self, blob: &BlobMetadata, document_id: Option<&str>) -> SomaResult<()> {
        self.repos.blob_repo().upsert_blob(blob).await?;
        if let Some(document_id) = document_id {
            if !document_id.trim().is_empty() {
                self.repos
                    .blob_repo()
                    .add_ref(&BlobRef {
                        space_id: blob.space_id.clone(),
                        cid: blob.cid.clone(),
                        document_id: document_id.to_string(),
                        created_at_ms: blob.created_at_ms,
                    })
                    .await?;
            }
        }
        Ok(())
    }

    pub async fn get_metadata(
        &self,
        space_id: &str,
        cid: &str,
    ) -> SomaResult<Option<BlobMetadata>> {
        self.repos.blob_repo().get_blob(space_id, cid).await
    }

    pub async fn list_blobs(
        &self,
        space_id: &str,
        document_id: Option<&str>,
        limit: u32,
        offset: u32,
    ) -> SomaResult<Vec<BlobMetadata>> {
        if let Some(document_id) = document_id {
            if !document_id.trim().is_empty() {
                return self
                    .repos
                    .blob_repo()
                    .list_blobs_for_document(space_id, document_id)
                    .await;
            }
        }

        self.repos.blob_repo().list_blobs(space_id, limit, offset).await
    }
}

