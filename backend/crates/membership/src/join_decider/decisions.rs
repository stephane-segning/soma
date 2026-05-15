use std::time::SystemTime;

use prost::Message;
use prost_types::Timestamp;
use soma_proto_build::space::{
    JoinDecision, JoinDecisionType, JoinRequest, MembershipCapability, SpaceId,
};
use soma_storage::membership::JoinDecision as StoredDecision;

pub(super) fn stored_decision(
    stored: StoredDecision,
    default_reason: &str,
    include_capability: bool,
) -> JoinDecision {
    JoinDecision {
        decision_id: stored.decision_id,
        space_id: Some(SpaceId {
            value: stored.space_id,
        }),
        subject_peer_id: Some(soma_proto_build::space::PeerId {
            value: stored.subject_peer_id,
        }),
        decision: stored.decision,
        reason: stored.reason.unwrap_or_else(|| default_reason.into()),
        capability: include_capability
            .then(|| {
                stored
                    .capability
                    .and_then(|bytes| MembershipCapability::decode(bytes.as_slice()).ok())
            })
            .flatten(),
        created_at: Some(Timestamp {
            seconds: stored.created_at,
            nanos: 0,
        }),
    }
}

pub(super) fn reject(reason: &str, request: &JoinRequest) -> JoinDecision {
    JoinDecision {
        decision_id: format!("reject-{}", reason),
        space_id: request.space_id.clone().or_else(|| {
            Some(SpaceId {
                value: "unknown".into(),
            })
        }),
        subject_peer_id: request.peer_id.clone(),
        decision: JoinDecisionType::JoinRejected as i32,
        reason: reason.to_string(),
        capability: None,
        created_at: Some(Timestamp::from(SystemTime::now())),
    }
}
