use std::{str::FromStr, time::SystemTime};

use libp2p::PeerId;
use prost_types::Timestamp;
use soma_core::SomaResult;
use soma_membership::{
    decide_join_request, enqueue_outgoing_join_decision, enqueue_outgoing_join_request,
    list_pending_join_requests, parse_role_str,
};
use soma_peer::PeerCommand;
use soma_proto_build::space::{self, JoinDecision, JoinDecisionType};
use tracing::warn;

use super::{
    DaemonHandle, invalid, parse_multiaddrs,
    types::{DecideJoinInput, JoinDecisionRecord, JoinRequestRecord, JoinSpaceInput},
};

impl DaemonHandle {
    /// Asynchronously submit a join request to a target onboarding peer.
    ///
    /// The request is persisted to the outbox, leased, and dispatched to the
    /// peer task. The actual decision comes back over the wire later and is
    /// surfaced via `stream_events`. The returned `request_id` is the local
    /// identifier the caller can use to correlate the eventual decision.
    pub async fn join_space(&self, input: JoinSpaceInput) -> SomaResult<String> {
        let JoinSpaceInput {
            space_id,
            display_name,
            device_name,
            target_peer_id,
            target_multiaddrs,
        } = input;

        let target_peer_id =
            PeerId::from_str(&target_peer_id).map_err(|_| invalid("invalid target peer id"))?;
        let addrs = parse_multiaddrs(target_multiaddrs)?;
        if addrs.is_empty() {
            return Err(invalid("target_multiaddrs required"));
        }

        let request_id = format!("{:016x}", rand::random::<u64>());
        let join_request = space::JoinRequest {
            space_id: Some(space::SpaceId {
                value: space_id.clone(),
            }),
            peer_id: Some(space::PeerId {
                value: self.state.peer_id.to_string(),
            }),
            display_name,
            device_name,
            requester_code: String::new(),
            requested_role: space::SpaceRole::Member as i32,
            invite_proof: None,
            created_at: Some(Timestamp::from(SystemTime::now())),
        };

        // Durably record that THIS peer itself asked `target_peer_id`
        // about `space_id`. This is the local, attacker-uncontrolled
        // ground truth `soma_membership::verify_and_apply_inbound_join_decision`
        // correlates an eventual inbound `JoinDecision` against — without
        // it, any connectable peer could push an unsolicited decision and
        // have it accepted. See the membership-forgery fix report.
        record_outgoing_join_request(
            &self.state.repos,
            &request_id,
            &space_id,
            &self.state.peer_id.to_string(),
            &target_peer_id.to_string(),
            join_request.requested_role,
        )
        .await;

        let delivery_id = enqueue_outgoing_join_request(
            &self.state.repos,
            &target_peer_id,
            &request_id,
            &addrs,
            &join_request,
        )
        .await
        .map_err(|_| invalid("failed to enqueue join request"))?;

        lease_mailbox_delivery(self, &delivery_id).await;

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
            .map_err(|_| invalid("peer task is not running"))?;

        self.state
            .publish(soma_proto_build::daemon::DaemonEvent {
                event: Some(
                    soma_proto_build::daemon::daemon_event::Event::JoinSubmitted(
                        soma_proto_build::daemon::JoinSubmitEvent {
                            request_id: request_id.clone(),
                            target_peer_id: target_peer_id.to_string(),
                        },
                    ),
                ),
            })
            .await;

        Ok(request_id)
    }

    pub async fn list_join_requests(&self) -> SomaResult<Vec<JoinRequestRecord>> {
        let rows = list_pending_join_requests(&self.state.repos).await?;
        Ok(rows
            .into_iter()
            .map(|r| JoinRequestRecord {
                request_id: r.request_id,
                space_id: r.space_id,
                subject_peer_id: r.subject_peer_id,
                display_name: r.display_name,
                device_name: r.device_name,
                requested_role: r.requested_role,
                created_at: r.created_at,
            })
            .collect())
    }

    pub async fn decide_join(&self, input: DecideJoinInput) -> SomaResult<JoinDecisionRecord> {
        let DecideJoinInput {
            request_id,
            approve,
            role,
            reason,
        } = input;

        let role_override = if role.is_empty() {
            None
        } else {
            parse_role_str(&role)
        };
        let reason = if reason.is_empty() {
            None
        } else {
            Some(reason)
        };

        let decision = decide_join_request(
            &self.state.repos,
            &self.state.signer,
            &self.state.peer_id,
            &request_id,
            approve,
            role_override,
            reason,
        )
        .await?;

        try_send_join_decision(self, &decision).await;
        Ok(to_decision_record(decision))
    }
}

/// Persist an outgoing (`is_outgoing = true`) `join_requests` row so a
/// later inbound `JoinDecision` from `target_peer_id` can be correlated
/// against it. Mirrors `somad`'s HTTP `submit_handler`
/// (`backend/bins/somad/src/commands/bot/http/join_requests.rs`), which
/// already does this for the bot's admin-HTTP join path; the desktop
/// daemon's `JoinSpace` never did.
async fn record_outgoing_join_request(
    repos: &dyn soma_storage::RepositoryProvider,
    request_id: &str,
    space_id: &str,
    subject_peer_id: &str,
    target_peer_id: &str,
    requested_role: i32,
) {
    let now_secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    if let Err(err) = repos
        .membership_repo()
        .upsert_join_request(&soma_storage::membership::JoinRequest {
            request_id: request_id.to_string(),
            space_id: space_id.to_string(),
            subject_peer_id: subject_peer_id.to_string(),
            display_name: String::new(),
            device_name: String::new(),
            requested_role,
            created_at: now_secs,
            payload: None,
            target_peer_id: Some(target_peer_id.to_string()),
            status: "pending".into(),
            attempts: 0,
            next_attempt_at: 0,
            last_error: None,
            is_outgoing: true,
        })
        .await
    {
        warn!(%err, %space_id, %target_peer_id, "failed to persist outgoing join request");
    }
}

async fn lease_mailbox_delivery(handle: &DaemonHandle, delivery_id: &str) {
    let now_secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let _ = handle
        .state
        .repos
        .mailbox_repo()
        .lease(
            delivery_id,
            &handle.state.peer_id.to_string(),
            now_secs + 30,
        )
        .await;
}

async fn try_send_join_decision(handle: &DaemonHandle, decision: &JoinDecision) {
    let Ok(delivery_id) = enqueue_outgoing_join_decision(&handle.state.repos, decision).await
    else {
        return;
    };
    lease_mailbox_delivery(handle, &delivery_id).await;

    let Some(target) = decision
        .subject_peer_id
        .as_ref()
        .and_then(|p| p.value.parse::<PeerId>().ok())
    else {
        return;
    };

    let _ = handle
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

fn to_decision_record(decision: JoinDecision) -> JoinDecisionRecord {
    let approved = matches!(
        JoinDecisionType::try_from(decision.decision),
        Ok(JoinDecisionType::JoinApproved)
    );
    let created_at_ms = decision
        .created_at
        .as_ref()
        .map(|ts| ts.seconds * 1000 + (ts.nanos as i64) / 1_000_000)
        .unwrap_or(0);
    JoinDecisionRecord {
        decision_id: decision.decision_id,
        space_id: decision.space_id.map(|s| s.value).unwrap_or_default(),
        subject_peer_id: decision
            .subject_peer_id
            .map(|p| p.value)
            .unwrap_or_default(),
        decision: decision.decision,
        reason: decision.reason,
        approved,
        created_at_ms,
    }
}
