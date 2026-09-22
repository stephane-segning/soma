use soma_core::SomaResult;
use soma_peer::{DocumentDigest, DocumentSyncRequest, PeerCommand};
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
            // Stamped here, not taken from the caller: this is the
            // record of who authored the version, and it is half of the
            // last-writer-wins key. A caller-supplied origin would let a
            // peer claim a higher id and win every tie.
            origin_peer_id: self.state.peer_id.to_string(),
        };
        DocumentsService::new(self.state.repos.clone())
            .upsert(&document)
            .await?;

        self.offer_document(&document).await;
        Ok(())
    }

    /// Tell the other members of the space that this document changed.
    ///
    /// Only a digest goes out, never the content — the peer decides
    /// whether it wants the new version and pulls it. Members that are
    /// not connected simply fail to receive the offer; they pick the
    /// change up from the connect-time sync instead, which is why this
    /// is fire-and-forget and never surfaces an error to the writer.
    async fn offer_document(&self, document: &Document) {
        let peers = crate::sync::space_peers(
            self.state.repos.as_ref(),
            &document.space_id,
            &self.state.peer_id,
        )
        .await;

        let digest = DocumentDigest {
            document_id: document.document_id.clone(),
            updated_at_ms: document.updated_at_ms,
            origin_peer_id: document.origin_peer_id.clone(),
            published: document.published,
        };

        for target in peers {
            let _ = self
                .state
                .peer_commands
                .send(PeerCommand::SyncDocuments {
                    target,
                    request: DocumentSyncRequest {
                        space_id: document.space_id.clone(),
                        have: vec![digest.clone()],
                        want: Vec::new(),
                        documents: Vec::new(),
                    },
                })
                .await;
        }
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
