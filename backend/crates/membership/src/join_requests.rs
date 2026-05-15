use std::time::SystemTime;

use libp2p::{PeerId, identity::Keypair};
use prost_types::Timestamp;
use soma_common::sign_membership_capability;
use soma_core::{Error, SomaResult};
use soma_proto_build::space::{
    JoinDecision, JoinDecisionType, MembershipCapability, SpaceId, SpaceRole,
};
use soma_storage::{RepositoryProvider, membership::JoinRequest as StoredJoinRequest};

use crate::{
    issuer::ensure_can_issue_membership,
    join_request_persistence::{
        mark_request_decided, persist_approved_decision, record_rejected_decision,
    },
    time::epoch_seconds,
};

pub async fn list_pending_join_requests(
    repos: &dyn RepositoryProvider,
) -> SomaResult<Vec<StoredJoinRequest>> {
    repos.membership_repo().list_join_requests().await
}

pub async fn decide_join_request(
    repos: &dyn RepositoryProvider,
    signer: &Keypair,
    issuer_peer_id: &PeerId,
    request_id: &str,
    approve: bool,
    role_override: Option<SpaceRole>,
    reason: Option<String>,
) -> SomaResult<JoinDecision> {
    let repo = repos.membership_repo();
    let req = repo
        .get_join_request(request_id)
        .await?
        .ok_or_else(|| Error::service("join request not found"))?;

    validate_request_target(&req, issuer_peer_id)?;

    let role_i32 = role_override
        .map(|role| role as i32)
        .unwrap_or(req.requested_role);
    let role = SpaceRole::try_from(role_i32).unwrap_or(SpaceRole::Member);
    ensure_can_issue_membership(repos, issuer_peer_id, &req.space_id, role_i32).await?;

    let now = SystemTime::now();
    let now_ts = Timestamp::from(now);
    let now_secs = epoch_seconds(now);
    let mut membership_cap = new_membership_capability(&req, issuer_peer_id, role, now_ts.clone());

    if approve {
        sign_membership_capability(&mut membership_cap, signer)?;
    }

    let decision = new_decision(&req, approve, reason, Some(now_ts), Some(&membership_cap));
    mark_request_decided(repo.as_ref(), &req, issuer_peer_id).await;

    if approve {
        persist_approved_decision(
            repo.as_ref(),
            &req,
            issuer_peer_id,
            role,
            now_secs,
            &decision,
            membership_cap,
        )
        .await;
    } else {
        record_rejected_decision(repo.as_ref(), &req, now_secs, &decision).await;
    }

    let _ = repo.delete_join_request(request_id).await;
    Ok(decision)
}

fn validate_request_target(req: &StoredJoinRequest, issuer_peer_id: &PeerId) -> SomaResult<()> {
    if req.is_outgoing {
        return Err(Error::service(
            "cannot decide outgoing (self-initiated) join request",
        ));
    }

    if let Some(target) = req.target_peer_id.as_deref() {
        if target != issuer_peer_id.to_string() {
            return Err(Error::service("join request not addressed to this peer"));
        }
    }

    Ok(())
}

fn new_membership_capability(
    req: &StoredJoinRequest,
    issuer_peer_id: &PeerId,
    role: SpaceRole,
    issued_at: Timestamp,
) -> MembershipCapability {
    MembershipCapability {
        space_id: Some(SpaceId {
            value: req.space_id.clone(),
        }),
        subject_peer_id: Some(soma_proto_build::space::PeerId {
            value: req.subject_peer_id.clone(),
        }),
        role: role as i32,
        permissions: Vec::new(),
        issued_at: Some(issued_at),
        expires_at: None,
        issuer_peer_id: Some(soma_proto_build::space::PeerId {
            value: issuer_peer_id.to_string(),
        }),
        issuer_cap: None,
        signed: None,
    }
}

fn new_decision(
    req: &StoredJoinRequest,
    approve: bool,
    reason: Option<String>,
    created_at: Option<Timestamp>,
    membership_cap: Option<&MembershipCapability>,
) -> JoinDecision {
    JoinDecision {
        decision_id: format!("join-{:016x}", rand::random::<u64>()),
        space_id: Some(SpaceId {
            value: req.space_id.clone(),
        }),
        subject_peer_id: Some(soma_proto_build::space::PeerId {
            value: req.subject_peer_id.clone(),
        }),
        decision: if approve {
            JoinDecisionType::JoinApproved as i32
        } else {
            JoinDecisionType::JoinRejected as i32
        },
        reason: reason.unwrap_or_else(|| "manual decision".into()),
        capability: approve.then(|| membership_cap.cloned()).flatten(),
        created_at,
    }
}
