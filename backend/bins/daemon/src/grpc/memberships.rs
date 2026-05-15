use soma_proto_build::daemon;
use tonic::{Request, Response, Status};
use tracing::warn;

use super::DaemonService;

impl DaemonService {
    pub(super) async fn revoke_space_response(
        &self,
        request: Request<daemon::RevokeSpaceRequest>,
    ) -> Result<Response<daemon::RevokeSpaceResponse>, Status> {
        let payload = request.into_inner();
        let repo = self.state.repos.membership_repo();
        let rows = repo
            .delete_membership(&payload.space_id, &payload.subject_peer_id)
            .await
            .map_err(|err| {
                warn!(%err, "revoke_space failed");
                Status::internal("failed to revoke space membership")
            })?;

        if rows > 0 && payload.subject_peer_id == self.state.peer_id.to_string() {
            self.clear_space_local_cache(&payload.space_id).await?;
        }

        Ok(Response::new(daemon::RevokeSpaceResponse {
            accepted: rows > 0,
        }))
    }

    pub(super) async fn list_space_members_response(
        &self,
        request: Request<daemon::ListSpaceMembersRequest>,
    ) -> Result<Response<daemon::ListSpaceMembersResponse>, Status> {
        let payload = request.into_inner();
        let rows = self
            .state
            .repos
            .membership_repo()
            .list_memberships(&payload.space_id)
            .await
            .map_err(|err| {
                warn!(%err, "list_space_members failed");
                Status::internal("failed to list space members")
            })?;

        Ok(Response::new(daemon::ListSpaceMembersResponse {
            members: rows.into_iter().map(map_space_member).collect(),
        }))
    }

    pub(super) async fn list_my_memberships_response(
        &self,
        _request: Request<()>,
    ) -> Result<Response<daemon::ListMyMembershipsResponse>, Status> {
        let peer_id = self.state.peer_id.to_string();
        let rows = self
            .state
            .repos
            .membership_repo()
            .list_memberships_by_subject(&peer_id)
            .await
            .map_err(|err| {
                warn!(%err, "list_my_memberships failed");
                Status::internal("failed to list memberships")
            })?;

        Ok(Response::new(daemon::ListMyMembershipsResponse {
            memberships: rows.into_iter().map(map_space_member).collect(),
        }))
    }
}

fn map_space_member(m: soma_storage::membership::SpaceMembership) -> daemon::SpaceMember {
    daemon::SpaceMember {
        peer_id: m.subject_peer_id,
        role: m.role,
        expires_at: m.expires_at.unwrap_or_default(),
        space_id: m.space_id,
    }
}
