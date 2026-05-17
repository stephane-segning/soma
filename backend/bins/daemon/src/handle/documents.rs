use soma_core::SomaResult;
use soma_storage::documents::Document;

use crate::services::documents::DocumentsService;

use super::{
    DaemonHandle, invalid,
    types::{DocumentRecord, UpsertDocumentInput},
};

impl DaemonHandle {
    pub async fn upsert_document(&self, input: UpsertDocumentInput) -> SomaResult<()> {
        let UpsertDocumentInput {
            space_id,
            document_id,
            content_json,
            published,
            updated_at_ms,
        } = input;

        if space_id.is_empty() {
            return Err(invalid("space_id required"));
        }
        super::ensure_membership(&self.state, &space_id).await?;
        if document_id.is_empty() {
            return Err(invalid("document_id required"));
        }
        if content_json.is_empty() {
            return Err(invalid("content_json required"));
        }

        let document = Document {
            space_id,
            document_id,
            content_json,
            published,
            updated_at_ms,
        };
        DocumentsService::new(self.state.repos.clone())
            .upsert(&document)
            .await
    }

    pub async fn get_document(
        &self,
        space_id: &str,
        document_id: &str,
    ) -> SomaResult<Option<DocumentRecord>> {
        if space_id.is_empty() {
            return Err(invalid("space_id required"));
        }
        super::ensure_membership(&self.state, space_id).await?;
        if document_id.is_empty() {
            return Err(invalid("document_id required"));
        }

        let doc = DocumentsService::new(self.state.repos.clone())
            .get(space_id, document_id)
            .await?;
        Ok(doc.map(to_document_record))
    }
}

fn to_document_record(doc: Document) -> DocumentRecord {
    DocumentRecord {
        space_id: doc.space_id,
        document_id: doc.document_id,
        content_json: doc.content_json,
        published: doc.published,
        updated_at_ms: doc.updated_at_ms,
    }
}
