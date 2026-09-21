use async_trait::async_trait;
use soma_peer::PeerEvent;
use soma_peer::events::{PeerEventHandler, PeerEventKind};
use soma_storage::blobs::BlobMetadata;
use tracing::warn;

use crate::state::DaemonState;

/// Reconciles a network-fetched blob into SQL metadata so it becomes
/// visible to `list_blobs` (item 5 of the blob-subsystem gaps: "network
/// received blobs never get SQL metadata"). `soma-peer` has no
/// `soma-storage`/`sqlx` dependency by design — that boundary stays in the
/// daemon, which already owns both.
///
/// Deliberately does *not* call `add_ref`: `BlobResponseReceived` carries
/// no `document_id` (the fetch protocol is CID-scoped, not
/// document-scoped), so `blob_refs` reconciliation stays a separate
/// concern tied to document content sync, out of this task's scope.
pub struct BlobReconcileHandler;

#[async_trait]
impl PeerEventHandler<DaemonState> for BlobReconcileHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[PeerEventKind::BlobResponseReceived]
    }

    async fn handle(&self, ctx: &DaemonState, event: &PeerEvent) {
        let PeerEvent::BlobResponseReceived {
            space_id,
            cid,
            mime,
            size,
            found,
            stored,
        } = event
        else {
            return;
        };

        if !*found || !*stored || space_id.is_empty() || cid.is_empty() {
            return;
        }

        let now = crate::handle::now_ms();
        let metadata = BlobMetadata {
            space_id: space_id.clone(),
            cid: cid.clone(),
            size: *size as i64,
            mime: mime.clone(),
            // No original filename travels over the fetch protocol. The
            // repo's upsert (`ON CONFLICT ... name = CASE WHEN excluded.name
            // != '' THEN excluded.name ELSE blobs.name END`) already
            // preserves a real name from a prior local upload instead of
            // clobbering it with this blank one.
            name: String::new(),
            created_at_ms: now,
            last_seen_ms: now,
        };

        if let Err(err) = ctx.repos.blob_repo().upsert_blob(&metadata).await {
            warn!(%space_id, %cid, %err, "failed to reconcile fetched blob metadata");
        }
    }
}
