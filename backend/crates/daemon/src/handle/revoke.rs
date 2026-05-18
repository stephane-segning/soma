use soma_core::SomaResult;
use tracing::info;

use crate::state::DaemonState;

use super::{DaemonHandle, types::RevokeSpaceInput};

impl DaemonHandle {
    /// Revoke a space membership row. Returns `true` if a row was deleted.
    /// If the revoked membership is the local peer's own, the page/document
    /// cache for that space is also cleared.
    pub async fn revoke_space(&self, input: RevokeSpaceInput) -> SomaResult<bool> {
        let RevokeSpaceInput {
            space_id,
            subject_peer_id,
            ..
        } = input;
        let repo = self.state.repos.membership_repo();
        let rows = repo
            .delete_membership(&space_id, &subject_peer_id)
            .await?;

        if rows > 0 && subject_peer_id == self.state.peer_id.to_string() {
            clear_space_local_cache(&self.state, &space_id).await?;
        }
        Ok(rows > 0)
    }
}

pub(crate) async fn clear_space_local_cache(
    state: &DaemonState,
    space_id: &str,
) -> SomaResult<()> {
    let page_rows = state
        .repos
        .page_repo()
        .delete_pages_for_space(space_id)
        .await?;
    let document_rows = state
        .repos
        .document_repo()
        .delete_documents_for_space(space_id)
        .await?;

    info!(
        %space_id,
        page_rows,
        document_rows,
        "cleared local page/document cache for revoked space membership"
    );
    Ok(())
}
