use libp2p::PeerId;
use prost::Message;
use soma_proto_build::space::{JoinDecision, MembershipCapability, SpaceRole};
use soma_storage::membership::{
    JoinDecision as StoredDecision, JoinRequest as StoredJoinRequest, MembershipRepository,
};

use crate::{membership_store::persist_membership, roles::role_to_str};

pub(crate) async fn mark_request_decided(
    repo: &dyn MembershipRepository,
    req: &StoredJoinRequest,
    issuer_peer_id: &PeerId,
) {
    let _ = repo
        .upsert_join_request(&StoredJoinRequest {
            request_id: req.request_id.clone(),
            space_id: req.space_id.clone(),
            subject_peer_id: req.subject_peer_id.clone(),
            display_name: req.display_name.clone(),
            device_name: req.device_name.clone(),
            requested_role: req.requested_role,
            created_at: req.created_at,
            payload: req.payload.clone(),
            target_peer_id: Some(issuer_peer_id.to_string()),
            status: "decided".into(),
            attempts: req.attempts,
            next_attempt_at: req.next_attempt_at,
            last_error: None,
            is_outgoing: false,
        })
        .await;
}

pub(crate) async fn persist_approved_decision(
    repo: &dyn MembershipRepository,
    req: &StoredJoinRequest,
    issuer_peer_id: &PeerId,
    role: SpaceRole,
    now_secs: i64,
    decision: &JoinDecision,
    membership_cap: MembershipCapability,
) {
    let cap_bytes = membership_cap.encode_to_vec();
    persist_membership(
        repo,
        &req.space_id,
        &req.subject_peer_id,
        issuer_peer_id,
        role_to_str(role),
        now_secs,
        cap_bytes.clone(),
    )
    .await;

    let _ = repo
        .record_join_decision(&StoredDecision {
            decision_id: decision.decision_id.clone(),
            space_id: req.space_id.clone(),
            subject_peer_id: req.subject_peer_id.clone(),
            decision: decision.decision,
            reason: Some(decision.reason.clone()),
            created_at: now_secs,
            capability: Some(cap_bytes),
        })
        .await;
}

pub(crate) async fn record_rejected_decision(
    repo: &dyn MembershipRepository,
    req: &StoredJoinRequest,
    now_secs: i64,
    decision: &JoinDecision,
) {
    let _ = repo
        .record_join_decision(&StoredDecision {
            decision_id: decision.decision_id.clone(),
            space_id: req.space_id.clone(),
            subject_peer_id: req.subject_peer_id.clone(),
            decision: decision.decision,
            reason: Some(decision.reason.clone()),
            created_at: now_secs,
            capability: None,
        })
        .await;
}
