use std::{pin::Pin, str::FromStr, sync::Arc, time::SystemTime};

use futures::Stream;
use libp2p::{PeerId, identity::Keypair};
use prost_types::Timestamp;
use soma_membership::{
    decide_join_request, enqueue_outgoing_join_decision, enqueue_outgoing_join_request,
    list_pending_join_requests, parse_role_str,
};
use soma_peer::PeerCommand;
use soma_proto_build::{daemon, spaceroom};
use tokio::sync::{Mutex, broadcast, mpsc};
use tokio_stream::{StreamExt as TokioStreamExt, wrappers::BroadcastStream};
use tonic::{Request, Response, Status};
use tracing::{info, warn};

use crate::services::blobs::BlobsService;
use crate::services::documents::DocumentsService;
use crate::services::pages::PagesService;
use crate::services::space::SpaceManager;
use soma_storage::RepositoryProvider;
use soma_storage::blobs::BlobMetadata;
use soma_storage::documents::Document;
use soma_storage::pages::Page;
use soma_vdfs::fs::FsBlobStore;

const MAX_UPLOAD_BYTES: usize = 8 * 1024 * 1024;

fn now_ms() -> i64 {
    use std::time::UNIX_EPOCH;

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}

fn to_page_record(page: Page) -> daemon::PageRecord {
    daemon::PageRecord {
        space_id: page.space_id,
        page_id: page.page_id,
        title: page.title,
        parent_page_ids: page.parent_page_ids,
        created_at_ms: page.created_at_ms,
        updated_at_ms: page.updated_at_ms,
    }
}

fn to_blob_metadata(blob: BlobMetadata) -> daemon::BlobMetadata {
    daemon::BlobMetadata {
        space_id: blob.space_id,
        cid: blob.cid,
        size: blob.size.max(0) as u64,
        mime: blob.mime,
        name: blob.name,
        created_at_ms: blob.created_at_ms,
        last_seen_ms: blob.last_seen_ms,
    }
}
/// Daemon shared state (peer id, command channel, listeners, event bus).
pub struct DaemonState {
    pub peer_id: PeerId,
    pub peer_commands: mpsc::Sender<PeerCommand>,
    pub listen_addrs: Mutex<Vec<String>>,
    pub events: broadcast::Sender<daemon::DaemonEvent>,
    pub repos: Arc<dyn RepositoryProvider>,
    pub signer: Keypair,
    pub blob_store: FsBlobStore,
    pub space_manager: Arc<dyn SpaceManager>,
    pub identify_keys: Mutex<std::collections::HashMap<PeerId, libp2p::identity::PublicKey>>,
}

impl DaemonState {
    pub async fn publish(&self, event: daemon::DaemonEvent) {
        let _ = self.events.send(event);
    }
}

#[derive(Clone)]
pub struct DaemonService {
    pub state: Arc<DaemonState>,
}

impl DaemonService {
    /// Ensure the daemon peer has membership for a space before serving requests.
    async fn ensure_membership(&self, space_id: &str) -> Result<(), Status> {
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
}

#[tonic::async_trait]
impl daemon::daemon_server::Daemon for DaemonService {
    type StreamEventsStream =
        Pin<Box<dyn Stream<Item = Result<daemon::DaemonEvent, Status>> + Send + 'static>>;

    async fn status(
        &self,
        _request: Request<daemon::StatusRequest>,
    ) -> Result<Response<daemon::StatusResponse>, Status> {
        let addrs = self.state.listen_addrs.lock().await.clone();
        Ok(Response::new(daemon::StatusResponse {
            peer_id: self.state.peer_id.to_string(),
            listen_addrs: addrs,
        }))
    }

    async fn join_space(
        &self,
        request: Request<daemon::JoinSpaceRequest>,
    ) -> Result<Response<daemon::JoinSpaceResponse>, Status> {
        let payload = request.into_inner();
        let target_peer_id = PeerId::from_str(&payload.target_peer_id)
            .map_err(|_| Status::invalid_argument("invalid target peer id"))?;

        let mut addrs = Vec::new();
        for addr in payload.target_multiaddrs {
            let parsed: libp2p::Multiaddr = addr
                .parse()
                .map_err(|_| Status::invalid_argument("invalid multiaddr in target_multiaddrs"))?;
            addrs.push(parsed);
        }
        if addrs.is_empty() {
            return Err(Status::invalid_argument("target_multiaddrs required"));
        }

        let request_id = format!("{:016x}", rand::random::<u64>());
        let join_request = spaceroom::JoinRequest {
            space_id: Some(spaceroom::SpaceId {
                value: payload.space_id,
            }),
            peer_id: Some(spaceroom::PeerId {
                value: self.state.peer_id.to_string(),
            }),
            display_name: payload.display_name,
            device_name: payload.device_name,
            student_code: String::new(),
            requested_role: spaceroom::SpaceRole::Student as i32,
            invite_proof: None,
            created_at: Some(Timestamp::from(SystemTime::now())),
        };

        let delivery_id = enqueue_outgoing_join_request(
            &self.state.repos,
            &target_peer_id,
            &request_id,
            &addrs,
            &join_request,
        )
        .await
        .map_err(|_| Status::internal("failed to enqueue join request"))?;

        let now_secs = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let _ = self
            .state
            .repos
            .mailbox_repo()
            .lease(&delivery_id, &self.state.peer_id.to_string(), now_secs + 30)
            .await;

        self.state
            .peer_commands
            .send(PeerCommand::SendJoinRequest {
                target: target_peer_id,
                addrs,
                delivery_id,
                request_id: request_id.clone(),
                request: join_request,
            })
            .await
            .map_err(|_| Status::internal("peer task is not running"))?;

        self.state
            .publish(daemon::DaemonEvent {
                event: Some(daemon::daemon_event::Event::JoinSubmitted(
                    daemon::JoinSubmitEvent {
                        request_id: request_id.clone(),
                        target_peer_id: target_peer_id.to_string(),
                    },
                )),
            })
            .await;

        Ok(Response::new(daemon::JoinSpaceResponse { request_id }))
    }

    async fn stream_events(
        &self,
        _request: Request<daemon::StreamEventsRequest>,
    ) -> Result<Response<Self::StreamEventsStream>, Status> {
        let stream = BroadcastStream::new(self.state.events.subscribe())
            .filter_map(|msg: Result<daemon::DaemonEvent, _>| msg.ok())
            .map(Ok);
        Ok(Response::new(Box::pin(stream)))
    }

    async fn revoke_space(
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

        Ok(Response::new(daemon::RevokeSpaceResponse {
            accepted: rows > 0,
        }))
    }

    async fn list_space_members(
        &self,
        request: Request<daemon::ListSpaceMembersRequest>,
    ) -> Result<Response<daemon::ListSpaceMembersResponse>, Status> {
        let payload = request.into_inner();
        let repo = self.state.repos.membership_repo();
        let rows = repo
            .list_memberships(&payload.space_id)
            .await
            .map_err(|err| {
                warn!(%err, "list_space_members failed");
                Status::internal("failed to list space members")
            })?;

        let members = rows
            .into_iter()
            .map(|m| daemon::SpaceMember {
                peer_id: m.subject_peer_id,
                role: m.role,
                expires_at: m.expires_at.unwrap_or_default(),
                space_id: m.space_id,
            })
            .collect();

        Ok(Response::new(daemon::ListSpaceMembersResponse { members }))
    }

    async fn upload_blob(
        &self,
        request: Request<daemon::UploadBlobRequest>,
    ) -> Result<Response<daemon::UploadBlobResponse>, Status> {
        let payload = request.into_inner();
        if payload.space_id.is_empty() {
            return Err(Status::invalid_argument("space_id required"));
        }
        self.ensure_membership(&payload.space_id).await?;
        if payload.data.is_empty() {
            return Err(Status::invalid_argument("data required"));
        }
        if payload.data.len() > MAX_UPLOAD_BYTES {
            return Err(Status::invalid_argument("blob too large"));
        }

        let mime = if payload.mime.is_empty() {
            "application/octet-stream".to_string()
        } else {
            payload.mime.clone()
        };

        let write_res = self
            .state
            .blob_store
            .write_local(&payload.space_id, &payload.data)
            .await
            .map_err(|err| {
                warn!(%err, "failed to persist blob");
                Status::internal("failed to persist blob")
            })?;

        let now = now_ms();
        let blob_metadata = BlobMetadata {
            space_id: payload.space_id.clone(),
            cid: write_res.cid.clone(),
            size: write_res.size as i64,
            mime: mime.clone(),
            name: payload.name.clone(),
            created_at_ms: now,
            last_seen_ms: now,
        };
        BlobsService::new(self.state.repos.clone())
            .record_upload(
                &blob_metadata,
                if payload.doc_id.is_empty() {
                    None
                } else {
                    Some(payload.doc_id.as_str())
                },
            )
            .await
            .map_err(|err| {
                warn!(%err, "failed to persist blob metadata");
                Status::internal("failed to persist blob metadata")
            })?;

        // Emit event only when tied to Yoopta content.
        if !payload.doc_id.is_empty() {
            self.state
                .publish(daemon::DaemonEvent {
                    event: Some(daemon::daemon_event::Event::YooptaBlobAdded(
                        daemon::YooptaBlobAddedEvent {
                            space_id: payload.space_id.clone(),
                            doc_id: payload.doc_id.clone(),
                            cid: write_res.cid.clone(),
                            mime: mime.clone(),
                            size: write_res.size as u64,
                            name: payload.name.clone(),
                        },
                    )),
                })
                .await;

            info!(
                space_id = %payload.space_id,
                doc_id = %payload.doc_id,
                cid = %write_res.cid,
                size = write_res.size,
                "yoopta blob stored"
            );
        }

        Ok(Response::new(daemon::UploadBlobResponse {
            cid: write_res.cid,
            size: write_res.size,
            mime,
            name: payload.name,
        }))
    }

    async fn read_blob(
        &self,
        request: Request<daemon::ReadBlobRequest>,
    ) -> Result<Response<daemon::ReadBlobResponse>, Status> {
        let payload = request.into_inner();
        if payload.space_id.is_empty() {
            return Err(Status::invalid_argument("space_id required"));
        }
        if payload.cid.is_empty() {
            return Err(Status::invalid_argument("cid required"));
        }
        self.ensure_membership(&payload.space_id).await?;

        let Some(bytes) = self
            .state
            .blob_store
            .read(&payload.space_id, &payload.cid)
            .await
            .map_err(|err| {
                warn!(%err, "read_blob failed");
                Status::internal("failed to read blob")
            })?
        else {
            return Err(Status::not_found("blob not found"));
        };

        if bytes.len() > MAX_UPLOAD_BYTES {
            return Err(Status::resource_exhausted("blob too large"));
        }

        Ok(Response::new(daemon::ReadBlobResponse {
            size: bytes.len() as u64,
            data: bytes,
            mime: "application/octet-stream".to_string(),
        }))
    }

    async fn issue_issuer_capability(
        &self,
        _request: Request<daemon::IssueIssuerCapabilityRequest>,
    ) -> Result<Response<daemon::IssueIssuerCapabilityResponse>, Status> {
        Err(Status::unimplemented(
            "IssueIssuerCapability not yet implemented",
        ))
    }

    async fn discover_spaces(
        &self,
        _request: Request<daemon::DiscoverSpacesRequest>,
    ) -> Result<Response<daemon::DiscoverSpacesResponse>, Status> {
        Err(Status::unimplemented("DiscoverSpaces not yet implemented"))
    }

    async fn list_join_requests(
        &self,
        _request: Request<daemon::ListJoinRequestsRequest>,
    ) -> Result<Response<daemon::ListJoinRequestsResponse>, Status> {
        let rows = list_pending_join_requests(&self.state.repos)
            .await
            .map_err(|err| {
                warn!(%err, "list_join_requests failed");
                Status::internal("failed to list join requests")
            })?;

        let requests = rows
            .into_iter()
            .map(|r| daemon::JoinRequest {
                request_id: r.request_id,
                space_id: r.space_id,
                subject_peer_id: r.subject_peer_id,
                display_name: r.display_name,
                device_name: r.device_name,
                requested_role: r.requested_role,
                created_at: r.created_at,
            })
            .collect();

        Ok(Response::new(daemon::ListJoinRequestsResponse { requests }))
    }

    async fn upsert_document(
        &self,
        request: Request<daemon::UpsertDocumentRequest>,
    ) -> Result<Response<daemon::UpsertDocumentResponse>, Status> {
        let payload = request.into_inner();
        if payload.space_id.is_empty() {
            return Err(Status::invalid_argument("space_id required"));
        }
        self.ensure_membership(&payload.space_id).await?;
        if payload.document_id.is_empty() {
            return Err(Status::invalid_argument("document_id required"));
        }
        if payload.content_json.is_empty() {
            return Err(Status::invalid_argument("content_json required"));
        }

        let document = Document {
            space_id: payload.space_id,
            document_id: payload.document_id,
            content_json: payload.content_json,
            published: payload.published,
            updated_at_ms: payload.updated_at_ms,
        };

        DocumentsService::new(self.state.repos.clone())
            .upsert(&document)
            .await
            .map_err(|err| {
                warn!(%err, "upsert_document failed");
                Status::internal("failed to upsert document")
            })?;

        Ok(Response::new(daemon::UpsertDocumentResponse { ok: true }))
    }

    async fn get_document(
        &self,
        request: Request<daemon::GetDocumentRequest>,
    ) -> Result<Response<daemon::GetDocumentResponse>, Status> {
        let payload = request.into_inner();
        if payload.space_id.is_empty() {
            return Err(Status::invalid_argument("space_id required"));
        }
        self.ensure_membership(&payload.space_id).await?;
        if payload.document_id.is_empty() {
            return Err(Status::invalid_argument("document_id required"));
        }

        let document = DocumentsService::new(self.state.repos.clone())
            .get(&payload.space_id, &payload.document_id)
            .await
            .map_err(|err| {
                warn!(%err, "get_document failed");
                Status::internal("failed to fetch document")
            })?;

        let Some(document) = document else {
            return Err(Status::not_found("document not found"));
        };

        Ok(Response::new(daemon::GetDocumentResponse {
            space_id: document.space_id,
            document_id: document.document_id,
            content_json: document.content_json,
            published: document.published,
            updated_at_ms: document.updated_at_ms,
        }))
    }

    async fn ensure_page(
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

    async fn list_pages(
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

    async fn update_page_title(
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

    async fn set_page_parents(
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

    async fn decide_join(
        &self,
        request: Request<daemon::DecideJoinRequest>,
    ) -> Result<Response<daemon::DecideJoinResponse>, Status> {
        let payload = request.into_inner();
        let role_override = if payload.role.is_empty() {
            None
        } else {
            parse_role_str(&payload.role)
        };
        let reason = if payload.reason.is_empty() {
            None
        } else {
            Some(payload.reason)
        };

        let decision = decide_join_request(
            &self.state.repos,
            &self.state.signer,
            &self.state.peer_id,
            &payload.request_id,
            payload.approve,
            role_override,
            reason,
        )
        .await
        .map_err(|err| {
            warn!(%err, "decide_join failed");
            Status::internal("failed to decide join")
        })?;

        if let Ok(delivery_id) = enqueue_outgoing_join_decision(&self.state.repos, &decision).await
        {
            let now_secs = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64;
            let _ = self
                .state
                .repos
                .mailbox_repo()
                .lease(&delivery_id, &self.state.peer_id.to_string(), now_secs + 30)
                .await;

            if let Some(target) = decision
                .subject_peer_id
                .as_ref()
                .and_then(|p| p.value.parse::<PeerId>().ok())
            {
                let _ = self
                    .state
                    .peer_commands
                    .send(PeerCommand::SendJoinDecision {
                        target,
                        addrs: Vec::new(),
                        delivery_id,
                        decision: decision.clone(),
                    })
                    .await;
            }
        }

        Ok(Response::new(daemon::DecideJoinResponse {
            decision: Some(decision),
        }))
    }

    async fn list_my_memberships(
        &self,
        _request: Request<()>,
    ) -> Result<Response<daemon::ListMyMembershipsResponse>, Status> {
        let peer_id = self.state.peer_id.to_string();
        let repo = self.state.repos.membership_repo();
        let rows = repo
            .list_memberships_by_subject(&peer_id)
            .await
            .map_err(|err| {
                warn!(%err, "list_my_memberships failed");
                Status::internal("failed to list memberships")
            })?;

        let memberships = rows
            .into_iter()
            .map(|m| daemon::SpaceMember {
                peer_id: m.subject_peer_id,
                role: m.role,
                expires_at: m.expires_at.unwrap_or_default(),
                space_id: m.space_id,
            })
            .collect();

        Ok(Response::new(daemon::ListMyMembershipsResponse {
            memberships,
        }))
    }

    async fn list_spaces(
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

    async fn create_space(
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

    async fn get_space(
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

    async fn update_space(
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

    async fn delete_space(
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

fn map_space_record(space: crate::services::space::SpaceRecord) -> daemon::Space {
    daemon::Space {
        space_id: space.space_id,
        display_name: space.display_name.unwrap_or_default(),
        owner_peer_id: space.owner_peer_id.unwrap_or_default(),
        created_at: space.created_at,
    }
}
