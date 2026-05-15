use soma_proto_build::daemon;
use tonic::{Request, Response, Status};
use tracing::warn;

use super::{DaemonService, mappers::map_space_record};

impl DaemonService {
    pub(super) async fn issue_issuer_capability_response(
        &self,
        _request: Request<daemon::IssueIssuerCapabilityRequest>,
    ) -> Result<Response<daemon::IssueIssuerCapabilityResponse>, Status> {
        Err(Status::unimplemented(
            "IssueIssuerCapability not yet implemented",
        ))
    }

    pub(super) async fn discover_spaces_response(
        &self,
        _request: Request<daemon::DiscoverSpacesRequest>,
    ) -> Result<Response<daemon::DiscoverSpacesResponse>, Status> {
        Err(Status::unimplemented("DiscoverSpaces not yet implemented"))
    }

    pub(super) async fn list_spaces_response(
        &self,
        request: Request<daemon::ListSpacesRequest>,
    ) -> Result<Response<daemon::ListSpacesResponse>, Status> {
        let payload = request.into_inner();
        let limit = payload.limit.max(1).min(200);
        let offset = payload.offset;
        let (spaces, next_offset) = self
            .state
            .space_manager
            .list_spaces(payload.q, limit, offset)
            .await
            .map_err(|err| {
                warn!(%err, "list_spaces failed");
                Status::internal("failed to list spaces")
            })?;

        Ok(Response::new(daemon::ListSpacesResponse {
            spaces: spaces.into_iter().map(map_space_record).collect(),
            limit,
            offset,
            next_offset,
        }))
    }

    pub(super) async fn create_space_response(
        &self,
        request: Request<daemon::CreateSpaceRequest>,
    ) -> Result<Response<daemon::CreateSpaceResponse>, Status> {
        let payload = request.into_inner();
        let space = self
            .state
            .space_manager
            .create_space(Some(payload.space_id), Some(payload.display_name))
            .await
            .map_err(|err| {
                warn!(%err, "create_space failed");
                Status::internal("failed to create space")
            })?;

        Ok(Response::new(daemon::CreateSpaceResponse {
            space_id: space.space_id,
            owner_peer_id: space
                .owner_peer_id
                .unwrap_or_else(|| self.state.peer_id.to_string()),
        }))
    }

    pub(super) async fn get_space_response(
        &self,
        request: Request<daemon::GetSpaceRequest>,
    ) -> Result<Response<daemon::GetSpaceResponse>, Status> {
        let payload = request.into_inner();
        if payload.space_id.is_empty() {
            return Err(Status::invalid_argument("space_id required"));
        }

        let space = self
            .state
            .space_manager
            .get_space(&payload.space_id)
            .await
            .map_err(|err| {
                warn!(%err, "get_space failed");
                Status::internal("failed to load space")
            })?;

        Ok(Response::new(daemon::GetSpaceResponse {
            space: Some(map_space_record(space)),
        }))
    }

    pub(super) async fn update_space_response(
        &self,
        request: Request<daemon::UpdateSpaceRequest>,
    ) -> Result<Response<daemon::UpdateSpaceResponse>, Status> {
        let payload = request.into_inner();
        if payload.space_id.is_empty() {
            return Err(Status::invalid_argument("space_id required"));
        }

        let space = self
            .state
            .space_manager
            .update_space(&payload.space_id, Some(payload.display_name))
            .await
            .map_err(|err| {
                warn!(%err, "update_space failed");
                Status::internal("failed to update space")
            })?;

        Ok(Response::new(daemon::UpdateSpaceResponse {
            space: Some(map_space_record(space)),
        }))
    }

    pub(super) async fn delete_space_response(
        &self,
        request: Request<daemon::DeleteSpaceRequest>,
    ) -> Result<Response<daemon::DeleteSpaceResponse>, Status> {
        let payload = request.into_inner();
        if payload.space_id.is_empty() {
            return Err(Status::invalid_argument("space_id required"));
        }

        let deleted = self
            .state
            .space_manager
            .delete_space(&payload.space_id)
            .await
            .map_err(|err| {
                warn!(%err, "delete_space failed");
                Status::internal("failed to delete space")
            })?;

        Ok(Response::new(daemon::DeleteSpaceResponse { deleted }))
    }
}
