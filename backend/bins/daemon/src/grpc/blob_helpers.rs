use soma_proto_build::daemon;
use tracing::info;

use crate::services::blobs::BlobsService;

use super::DaemonService;

impl DaemonService {
    pub(super) async fn blob_mime_or_default(&self, space_id: &str, cid: &str) -> String {
        BlobsService::new(self.state.repos.clone())
            .get_metadata(space_id, cid)
            .await
            .ok()
            .flatten()
            .map(|m| m.mime)
            .filter(|m| !m.is_empty())
            .unwrap_or_else(|| "application/octet-stream".to_string())
    }

    pub(super) async fn publish_document_blob_added(
        &self,
        payload: &daemon::UploadBlobRequest,
        cid: &str,
        size: u64,
        mime: &str,
    ) {
        self.state
            .publish(daemon::DaemonEvent {
                event: Some(daemon::daemon_event::Event::DocumentBlobAdded(
                    daemon::DocumentBlobAddedEvent {
                        space_id: payload.space_id.clone(),
                        doc_id: payload.doc_id.clone(),
                        cid: cid.to_string(),
                        mime: mime.to_string(),
                        size,
                        name: payload.name.clone(),
                    },
                )),
            })
            .await;

        info!(
            space_id = %payload.space_id,
            doc_id = %payload.doc_id,
            %cid,
            size,
            "document blob stored"
        );
    }
}
