use std::time::SystemTime;

use prost::Message;
use soma_core::{Error, SomaResult};
use soma_proto_build::space::{JoinDecision, JoinDecisionType, SpaceRole};
use soma_storage::{
    RepositoryProvider,
    mailbox::NewMailboxEntry,
    membership::{JoinDecision as StoredDecision, Space, SpaceMembership},
};

use crate::{
    outgoing_join_requests::MAILBOX_KIND_JOIN_DECISION, roles::role_to_str, time::epoch_seconds,
};

pub async fn enqueue_outgoing_join_decision(
    repos: &dyn RepositoryProvider,
    decision: &JoinDecision,
) -> SomaResult<String> {
    let space_id = decision
        .space_id
        .as_ref()
        .ok_or_else(|| Error::service("missing decision.space_id"))?
        .value
        .clone();
    let subject_peer_id = decision
        .subject_peer_id
        .as_ref()
        .ok_or_else(|| Error::service("missing decision.subject_peer_id"))?
        .value
        .clone();
    let now_secs = epoch_seconds(SystemTime::now());
    let id = format!("mbx-{}", decision.decision_id);

    repos
        .mailbox_repo()
        .enqueue(&NewMailboxEntry {
            id: id.clone(),
            kind: MAILBOX_KIND_JOIN_DECISION.to_string(),
            space_id: Some(space_id),
            subject_peer_id: Some(subject_peer_id),
            available_at: now_secs,
            payload: Some(decision.encode_to_vec()),
            created_at: now_secs,
        })
        .await?;

    Ok(id)
}

pub async fn apply_join_decision(
    repos: &dyn RepositoryProvider,
    decision: &JoinDecision,
) -> SomaResult<()> {
    let Some(space_id) = decision.space_id.as_ref().map(|space| space.value.clone()) else {
        return Err(Error::service("missing decision.space_id"));
    };
    let Some(subject_peer_id) = decision.subject_peer_id.as_ref().map(|peer| peer.value.clone())
    else {
        return Err(Error::service("missing decision.subject_peer_id"));
    };

    let repo = repos.membership_repo();
    let now_secs = epoch_seconds(SystemTime::now());
    let cap_bytes = decision.capability.as_ref().map(|cap| cap.encode_to_vec());

    repo.record_join_decision(&StoredDecision {
        decision_id: decision.decision_id.clone(),
        space_id: space_id.clone(),
        subject_peer_id: subject_peer_id.clone(),
        decision: decision.decision,
        reason: Some(decision.reason.clone()),
        created_at: decision
            .created_at
            .as_ref()
            .map(|timestamp| timestamp.seconds)
            .unwrap_or(now_secs),
        capability: cap_bytes.clone(),
    })
    .await?;

    let decision_type =
        JoinDecisionType::try_from(decision.decision).unwrap_or(JoinDecisionType::JoinRejected);
    if decision_type != JoinDecisionType::JoinApproved {
        return Ok(());
    }

    let cap = decision
        .capability
        .as_ref()
        .ok_or_else(|| Error::service("approved decision missing capability"))?;
    let issued_at = cap
        .issued_at
        .as_ref()
        .map(|timestamp| timestamp.seconds)
        .unwrap_or(now_secs);

    repo.upsert_space(&Space {
        space_id: space_id.clone(),
        display_name: None,
        owner_peer_id: None,
        created_at: issued_at,
    })
    .await?;

    repo.upsert_membership(&SpaceMembership {
        space_id,
        subject_peer_id,
        role: role_to_str(SpaceRole::try_from(cap.role).unwrap_or(SpaceRole::Member)).to_string(),
        issuer_peer_id: cap
            .issuer_peer_id
            .as_ref()
            .map(|peer| peer.value.clone())
            .unwrap_or_else(|| "unknown".into()),
        issued_at,
        expires_at: cap.expires_at.as_ref().map(|timestamp| timestamp.seconds),
        capability: cap_bytes,
    })
    .await?;

    Ok(())
}
