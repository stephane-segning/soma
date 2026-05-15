use tonic::Status;
use tracing::{info, warn};

use super::DaemonService;

impl DaemonService {
    /// Ensure the daemon peer has membership for a space before serving requests.
    pub(super) async fn ensure_membership(&self, space_id: &str) -> Result<(), Status> {
        let peer_id = self.state.peer_id.to_string();
        let repo = self.state.repos.membership_repo();
        match repo.get_membership(space_id, &peer_id).await {
            Ok(Some(_)) => Ok(()),
            Ok(None) => Err(Status::permission_denied("not a member of this space")),
            Err(err) => {
                warn!(%err, %space_id, %peer_id, "membership check failed");
                Err(Status::internal("failed to verify membership"))
            }
        }
    }

    pub(super) async fn clear_space_local_cache(&self, space_id: &str) -> Result<(), Status> {
        let page_repo = self.state.repos.page_repo();
        let document_repo = self.state.repos.document_repo();

        let page_rows = page_repo
            .delete_pages_for_space(space_id)
            .await
            .map_err(|err| {
                warn!(%err, %space_id, "failed to clear page cache for revoked space");
                Status::internal("failed to clear page cache")
            })?;

        let document_rows = document_repo
            .delete_documents_for_space(space_id)
            .await
            .map_err(|err| {
                warn!(%err, %space_id, "failed to clear document cache for revoked space");
                Status::internal("failed to clear document cache")
            })?;

        info!(
            %space_id,
            page_rows,
            document_rows,
            "cleared local page/document cache for revoked space membership"
        );

        Ok(())
    }
}
