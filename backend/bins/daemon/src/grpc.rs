use std::{pin::Pin, str::FromStr, sync::Arc, time::SystemTime};

use futures::Stream;
use libp2p::PeerId;
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

use libp2p::identity::Keypair;
use soma_storage::RepositoryProvider;
use soma_vdfs::fs::FsBlobStore;

const MAX_UPLOAD_BYTES: usize = 8 * 1024 * 1024;
/// Daemon shared state (peer id, command channel, listeners, event bus).
pub struct DaemonState {
    pub peer_id: PeerId,
    pub peer_commands: mpsc::Sender<PeerCommand>,
    pub listen_addrs: Mutex<Vec<String>>,
    pub events: broadcast::Sender<daemon::DaemonEvent>,
    pub repos: Arc<dyn RepositoryProvider>,
    pub signer: Keypair,
    pub blob_store: FsBlobStore,
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
        if payload.document_id.is_empty() {
            return Err(Status::invalid_argument("document_id required"));
        }
        if payload.content_json.is_empty() {
            return Err(Status::invalid_argument("content_json required"));
        }

        let published = if payload.published { 1_i64 } else { 0_i64 };
        sqlx::query(
            r#"
            INSERT INTO documents (space_id, document_id, content_json, published, updated_at_ms)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT(space_id, document_id)
            DO UPDATE SET
                content_json = excluded.content_json,
                published = excluded.published,
                updated_at_ms = excluded.updated_at_ms
            "#,
        )
        .bind(payload.space_id)
        .bind(payload.document_id)
        .bind(payload.content_json)
        .bind(published)
        .bind(payload.updated_at_ms)
        .execute(&self.state.repos.pool())
        .await
        .map_err(|err| {
            warn!(%err, "upsert_document failed");
            Status::internal("failed to upsert document")
        })?;

        Ok(Response::new(daemon::UpsertDocumentResponse { ok: true }))
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
}
