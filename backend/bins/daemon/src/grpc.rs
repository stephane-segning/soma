use soma_proto_build::daemon;
use tonic::{Request, Response, Status};

mod blob_helpers;
mod blobs;
mod documents;
mod errors;
mod events;
mod join;
mod memberships;
mod mappers;
mod pages;
mod spaces;
mod state;
mod status;

pub use state::{DaemonService, DaemonState};

#[tonic::async_trait]
impl daemon::daemon_server::Daemon for DaemonService {
    type StreamEventsStream = std::pin::Pin<
        Box<dyn futures::Stream<Item = Result<daemon::DaemonEvent, Status>> + Send + 'static>,
    >;

    async fn status(
        &self,
        request: Request<daemon::StatusRequest>,
    ) -> Result<Response<daemon::StatusResponse>, Status> {
        self.status_response(request).await
    }

    async fn stream_events(
        &self,
        request: Request<daemon::StreamEventsRequest>,
    ) -> Result<Response<Self::StreamEventsStream>, Status> {
        self.stream_events_response(request).await
    }

    async fn join_space(
        &self,
        request: Request<daemon::JoinSpaceRequest>,
    ) -> Result<Response<daemon::JoinSpaceResponse>, Status> {
        self.join_space_response(request).await
    }

    async fn list_join_requests(
        &self,
        request: Request<daemon::ListJoinRequestsRequest>,
    ) -> Result<Response<daemon::ListJoinRequestsResponse>, Status> {
        self.list_join_requests_response(request).await
    }

    async fn decide_join(
        &self,
        request: Request<daemon::DecideJoinRequest>,
    ) -> Result<Response<daemon::DecideJoinResponse>, Status> {
        self.decide_join_response(request).await
    }

    async fn revoke_space(
        &self,
        request: Request<daemon::RevokeSpaceRequest>,
    ) -> Result<Response<daemon::RevokeSpaceResponse>, Status> {
        self.revoke_space_response(request).await
    }

    async fn list_space_members(
        &self,
        request: Request<daemon::ListSpaceMembersRequest>,
    ) -> Result<Response<daemon::ListSpaceMembersResponse>, Status> {
        self.list_space_members_response(request).await
    }

    async fn list_my_memberships(
        &self,
        request: Request<()>,
    ) -> Result<Response<daemon::ListMyMembershipsResponse>, Status> {
        self.list_my_memberships_response(request).await
    }

    async fn list_spaces(
        &self,
        request: Request<daemon::ListSpacesRequest>,
    ) -> Result<Response<daemon::ListSpacesResponse>, Status> {
        self.list_spaces_response(request).await
    }

    async fn create_space(
        &self,
        request: Request<daemon::CreateSpaceRequest>,
    ) -> Result<Response<daemon::CreateSpaceResponse>, Status> {
        self.create_space_response(request).await
    }

    async fn get_space(
        &self,
        request: Request<daemon::GetSpaceRequest>,
    ) -> Result<Response<daemon::GetSpaceResponse>, Status> {
        self.get_space_response(request).await
    }

    async fn update_space(
        &self,
        request: Request<daemon::UpdateSpaceRequest>,
    ) -> Result<Response<daemon::UpdateSpaceResponse>, Status> {
        self.update_space_response(request).await
    }

    async fn delete_space(
        &self,
        request: Request<daemon::DeleteSpaceRequest>,
    ) -> Result<Response<daemon::DeleteSpaceResponse>, Status> {
        self.delete_space_response(request).await
    }

    async fn issue_issuer_capability(
        &self,
        request: Request<daemon::IssueIssuerCapabilityRequest>,
    ) -> Result<Response<daemon::IssueIssuerCapabilityResponse>, Status> {
        self.issue_issuer_capability_response(request).await
    }

    async fn discover_spaces(
        &self,
        request: Request<daemon::DiscoverSpacesRequest>,
    ) -> Result<Response<daemon::DiscoverSpacesResponse>, Status> {
        self.discover_spaces_response(request).await
    }

    async fn upsert_document(
        &self,
        request: Request<daemon::UpsertDocumentRequest>,
    ) -> Result<Response<daemon::UpsertDocumentResponse>, Status> {
        self.upsert_document_response(request).await
    }

    async fn get_document(
        &self,
        request: Request<daemon::GetDocumentRequest>,
    ) -> Result<Response<daemon::GetDocumentResponse>, Status> {
        self.get_document_response(request).await
    }

    async fn ensure_page(
        &self,
        request: Request<daemon::EnsurePageRequest>,
    ) -> Result<Response<daemon::EnsurePageResponse>, Status> {
        self.ensure_page_response(request).await
    }

    async fn list_pages(
        &self,
        request: Request<daemon::ListPagesRequest>,
    ) -> Result<Response<daemon::ListPagesResponse>, Status> {
        self.list_pages_response(request).await
    }

    async fn update_page_title(
        &self,
        request: Request<daemon::UpdatePageTitleRequest>,
    ) -> Result<Response<daemon::UpdatePageTitleResponse>, Status> {
        self.update_page_title_response(request).await
    }

    async fn set_page_parents(
        &self,
        request: Request<daemon::SetPageParentsRequest>,
    ) -> Result<Response<daemon::SetPageParentsResponse>, Status> {
        self.set_page_parents_response(request).await
    }

    async fn upload_blob(
        &self,
        request: Request<daemon::UploadBlobRequest>,
    ) -> Result<Response<daemon::UploadBlobResponse>, Status> {
        self.upload_blob_response(request).await
    }

    async fn read_blob(
        &self,
        request: Request<daemon::ReadBlobRequest>,
    ) -> Result<Response<daemon::ReadBlobResponse>, Status> {
        self.read_blob_response(request).await
    }

    async fn get_blob_metadata(
        &self,
        request: Request<daemon::GetBlobMetadataRequest>,
    ) -> Result<Response<daemon::GetBlobMetadataResponse>, Status> {
        self.get_blob_metadata_response(request).await
    }

    async fn list_blobs(
        &self,
        request: Request<daemon::ListBlobsRequest>,
    ) -> Result<Response<daemon::ListBlobsResponse>, Status> {
        self.list_blobs_response(request).await
    }
}
