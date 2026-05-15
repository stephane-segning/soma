use std::{str::FromStr, time::SystemTime};

use libp2p::PeerId;
use prost_types::Timestamp;
use soma_membership::{
    decide_join_request, enqueue_outgoing_join_decision, enqueue_outgoing_join_request,
    list_pending_join_requests, parse_role_str,
};
use soma_peer::PeerCommand;
use soma_proto_build::{daemon, space};
use tonic::{Request, Response, Status};
use tracing::warn;

use super::DaemonService;

impl DaemonService {
    pub(super) async fn join_space_response(
        &self,
        request: Request<daemon::JoinSpaceRequest>,
    ) -> Result<Response<daemon::JoinSpaceResponse>, Status> {
        let payload = request.into_inner();
        let target_peer_id = PeerId::from_str(&payload.target_peer_id)
            .map_err(|_| Status::invalid_argument("invalid target peer id"))?;
        let addrs = parse_multiaddrs(payload.target_multiaddrs)?;
        if addrs.is_empty() {
            return Err(Status::invalid_argument("target_multiaddrs required"));
        }

        let request_id = format!("{:016x}", rand::random::<u64>());
        let join_request = space::JoinRequest {
            space_id: Some(space::SpaceId {
                value: payload.space_id,
            }),
            peer_id: Some(space::PeerId {
                value: self.state.peer_id.to_string(),
            }),
            display_name: payload.display_name,
            device_name: payload.device_name,
            requester_code: String::new(),
            requested_role: space::SpaceRole::Member as i32,
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

        self.lease_mailbox_delivery(&delivery_id).await;
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

    pub(super) async fn list_join_requests_response(
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

    pub(super) async fn decide_join_response(
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

        self.try_send_join_decision(&decision).await;
        Ok(Response::new(daemon::DecideJoinResponse {
            decision: Some(decision),
        }))
    }

    async fn lease_mailbox_delivery(&self, delivery_id: &str) {
        let now_secs = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let _ = self
            .state
            .repos
            .mailbox_repo()
            .lease(delivery_id, &self.state.peer_id.to_string(), now_secs + 30)
            .await;
    }

    async fn try_send_join_decision(&self, decision: &space::JoinDecision) {
        let Ok(delivery_id) = enqueue_outgoing_join_decision(&self.state.repos, decision).await
        else {
            return;
        };
        self.lease_mailbox_delivery(&delivery_id).await;

        let Some(target) = decision
            .subject_peer_id
            .as_ref()
            .and_then(|p| p.value.parse::<PeerId>().ok())
        else {
            return;
        };

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

fn parse_multiaddrs(addrs: Vec<String>) -> Result<Vec<libp2p::Multiaddr>, Status> {
    addrs
        .into_iter()
        .map(|addr| {
            addr.parse()
                .map_err(|_| Status::invalid_argument("invalid multiaddr in target_multiaddrs"))
        })
        .collect()
}
