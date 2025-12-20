use std::{path::PathBuf, pin::Pin, str::FromStr, sync::Arc, time::SystemTime};

use futures::Stream;
use libp2p::PeerId;
use prost_types::Timestamp;
use soma_core::SomaResult;
use soma_membership::{
    decide_join_request, enqueue_outgoing_join_decision, list_pending_join_requests, parse_role_str,
};
use soma_peer::PeerCommand;
use soma_proto_build::{
    daemon,
    spaceroom,
};
use tokio::sync::{Mutex, broadcast, mpsc};
use tokio_stream::{StreamExt as TokioStreamExt, wrappers::BroadcastStream};
use tonic::{Request, Response, Status};
use tracing::warn;

use soma_socket::serve_grpc_unix;
use soma_storage::{RepositoryFactory, membership::MembershipRepository};
use libp2p::identity::Keypair;
/// Daemon shared state (peer id, command channel, listeners, event bus).
#[derive(Debug)]
pub struct DaemonState {
    pub peer_id: PeerId,
    pub peer_commands: mpsc::Sender<PeerCommand>,
    pub listen_addrs: Mutex<Vec<String>>,
    pub events: broadcast::Sender<daemon::DaemonEvent>,
    pub repos: RepositoryFactory,
    pub signer: Keypair,
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

        self.state
            .peer_commands
            .send(PeerCommand::SendJoinRequest {
                target: target_peer_id,
                addrs,
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
        let rows = self
            .state
            .repos
            .membership()
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
        let rows = self
            .state
            .repos
            .membership()
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
            })
            .collect();

        Ok(Response::new(daemon::ListSpaceMembersResponse { members }))
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
}

pub async fn serve_grpc(
    socket_path: PathBuf,
    server: daemon::daemon_server::DaemonServer<DaemonService>,
) -> SomaResult<()> {
    serve_grpc_unix(
        socket_path,
        tonic::transport::Server::builder().add_service(server),
        async {
            let _ = tokio::signal::ctrl_c().await;
        },
    )
    .await
}
