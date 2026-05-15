use libp2p::{PeerId, identity::Keypair};
use prost::Message;
use prost_types::Timestamp;
use soma_common::sign_membership_capability;
use soma_proto_build::space::{
    IssuerCapability, JoinDecision, JoinDecisionType, MembershipCapability, SpaceId, SpaceRole,
};
use soma_storage::membership::{JoinDecision as StoredDecision, MembershipRepository};
use tracing::warn;

use crate::{membership_store::persist_membership, roles::role_to_str};

pub(super) async fn approve_with_delegation(
    repo: &dyn MembershipRepository,
    signer: &Keypair,
    local_peer_id: &PeerId,
    space_id: SpaceId,
    subject_peer_id: soma_proto_build::space::PeerId,
    role: SpaceRole,
    issuer_cap: Option<IssuerCapability>,
    now_ts: Timestamp,
    now_secs: i64,
) -> JoinDecision {
    let mut membership_cap = MembershipCapability {
        space_id: Some(space_id.clone()),
        subject_peer_id: Some(subject_peer_id.clone()),
        role: role as i32,
        permissions: issuer_cap
            .as_ref()
            .map(|cap| cap.default_permissions.clone())
            .unwrap_or_default(),
        issued_at: Some(now_ts.clone()),
        expires_at: None,
        issuer_peer_id: Some(soma_proto_build::space::PeerId {
            value: local_peer_id.to_string(),
        }),
        issuer_cap,
        signed: None,
    };

    if let Err(err) = sign_membership_capability(&mut membership_cap, signer) {
        warn!(%err, "failed to sign membership capability");
    }

    let decision_id = format!("join-{:016x}", rand::random::<u64>());
    let decision = JoinDecision {
        decision_id: decision_id.clone(),
        space_id: Some(space_id.clone()),
        subject_peer_id: Some(subject_peer_id.clone()),
        decision: JoinDecisionType::JoinApproved as i32,
        reason: "approved".into(),
        capability: Some(membership_cap.clone()),
        created_at: Some(now_ts),
    };

    let membership_cap_bytes = membership_cap.encode_to_vec();
    persist_membership(
        repo,
        &space_id.value,
        &subject_peer_id.value,
        local_peer_id,
        role_to_str(role),
        now_secs,
        membership_cap_bytes.clone(),
    )
    .await;

    if let Err(err) = repo
        .record_join_decision(&StoredDecision {
            decision_id,
            space_id: space_id.value,
            subject_peer_id: subject_peer_id.value,
            decision: decision.decision,
            reason: Some("approved".into()),
            created_at: now_secs,
            capability: Some(membership_cap_bytes),
        })
        .await
    {
        warn!(%err, "failed to record join decision");
    }

    decision
}
