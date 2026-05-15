use soma_proto_build::daemon;
use soma_storage::pages::Page;
use tonic::{Request, Response, Status};
use tracing::warn;

use crate::services::pages::PagesService;

use super::{
    DaemonService,
    mappers::{now_ms, to_page_record},
};

impl DaemonService {
    pub(super) async fn ensure_page_response(
        &self,
        request: Request<daemon::EnsurePageRequest>,
    ) -> Result<Response<daemon::EnsurePageResponse>, Status> {
        let payload = request.into_inner();
        if payload.space_id.is_empty() {
            return Err(Status::invalid_argument("space_id required"));
        }
        self.ensure_membership(&payload.space_id).await?;
        if payload.page_id.is_empty() {
            return Err(Status::invalid_argument("page_id required"));
        }

        let now = now_ms();
        let title = if payload.title.trim().is_empty() {
            "Untitled page".to_string()
        } else {
            payload.title
        };

        let page = Page {
            space_id: payload.space_id,
            page_id: payload.page_id,
            title,
            parent_page_ids: payload.parent_page_ids,
            created_at_ms: if payload.created_at_ms == 0 {
                now
            } else {
                payload.created_at_ms
            },
            updated_at_ms: if payload.updated_at_ms == 0 {
                now
            } else {
                payload.updated_at_ms
            },
        };

        let page = PagesService::new(self.state.repos.clone())
            .ensure_page(&page)
            .await
            .map_err(|err| {
                warn!(%err, "ensure_page failed");
                Status::internal("failed to ensure page")
            })?;

        Ok(Response::new(daemon::EnsurePageResponse {
            page: Some(to_page_record(page)),
        }))
    }

    pub(super) async fn list_pages_response(
        &self,
        request: Request<daemon::ListPagesRequest>,
    ) -> Result<Response<daemon::ListPagesResponse>, Status> {
        let payload = request.into_inner();
        if payload.space_id.is_empty() {
            return Err(Status::invalid_argument("space_id required"));
        }
        self.ensure_membership(&payload.space_id).await?;

        let pages = PagesService::new(self.state.repos.clone())
            .list_pages(&payload.space_id)
            .await
            .map_err(|err| {
                warn!(%err, "list_pages failed");
                Status::internal("failed to list pages")
            })?;

        Ok(Response::new(daemon::ListPagesResponse {
            pages: pages.into_iter().map(to_page_record).collect(),
        }))
    }

    pub(super) async fn update_page_title_response(
        &self,
        request: Request<daemon::UpdatePageTitleRequest>,
    ) -> Result<Response<daemon::UpdatePageTitleResponse>, Status> {
        let payload = request.into_inner();
        if payload.space_id.is_empty() {
            return Err(Status::invalid_argument("space_id required"));
        }
        self.ensure_membership(&payload.space_id).await?;
        if payload.page_id.is_empty() {
            return Err(Status::invalid_argument("page_id required"));
        }
        if payload.title.trim().is_empty() {
            return Err(Status::invalid_argument("title required"));
        }

        let page = PagesService::new(self.state.repos.clone())
            .update_title(&payload.space_id, &payload.page_id, &payload.title)
            .await
            .map_err(|err| {
                warn!(%err, "update_page_title failed");
                Status::internal("failed to update page title")
            })?;

        let Some(page) = page else {
            return Err(Status::not_found("page not found"));
        };

        Ok(Response::new(daemon::UpdatePageTitleResponse {
            page: Some(to_page_record(page)),
        }))
    }

    pub(super) async fn set_page_parents_response(
        &self,
        request: Request<daemon::SetPageParentsRequest>,
    ) -> Result<Response<daemon::SetPageParentsResponse>, Status> {
        let payload = request.into_inner();
        if payload.space_id.is_empty() {
            return Err(Status::invalid_argument("space_id required"));
        }
        self.ensure_membership(&payload.space_id).await?;
        if payload.page_id.is_empty() {
            return Err(Status::invalid_argument("page_id required"));
        }

        let page = PagesService::new(self.state.repos.clone())
            .set_parents(
                &payload.space_id,
                &payload.page_id,
                &payload.parent_page_ids,
            )
            .await
            .map_err(|err| {
                warn!(%err, "set_page_parents failed");
                Status::internal("failed to set page parents")
            })?;

        let Some(page) = page else {
            return Err(Status::not_found("page not found"));
        };

        Ok(Response::new(daemon::SetPageParentsResponse {
            page: Some(to_page_record(page)),
        }))
    }
}
