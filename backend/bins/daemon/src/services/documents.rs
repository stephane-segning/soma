use std::sync::Arc;

use soma_core::SomaResult;
use soma_storage::{RepositoryProvider, documents::Document};

#[derive(Clone)]
pub struct DocumentsService {
    repos: Arc<dyn RepositoryProvider>,
}

impl DocumentsService {
    pub fn new(repos: Arc<dyn RepositoryProvider>) -> Self {
        Self { repos }
    }

    pub async fn upsert(&self, document: &Document) -> SomaResult<()> {
        self.repos.document_repo().upsert_document(document).await
    }

    pub async fn get(&self, space_id: &str, document_id: &str) -> SomaResult<Option<Document>> {
        self.repos
            .document_repo()
            .get_document(space_id, document_id)
            .await
    }
}
