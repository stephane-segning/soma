use std::{sync::Arc, time::SystemTime};

use async_trait::async_trait;
use libp2p::PeerId;
use prost::Message;
use prost_types::Timestamp;
use soma_peer::join::JoinDecider;
use soma_proto_build::spaceroom::{
    JoinDecision, JoinDecisionType, JoinRequest, MembershipCapability, SpaceId, SpaceRole,
};
use soma_storage::{
    RepositoryFactory,
    issuer::{IssuerRepository, SqlIssuerRepository},
    membership::{
        JoinDecision as StoredDecision, MembershipRepository, SqlMembershipRepository, Space,
        SpaceMembership,
    },
};
use tracing::warn;

#[derive(Clone)]
pub struct BotJoinDecider {
    membership_repo: SqlMembershipRepository,
    issuer_repo: SqlIssuerRepository,
}

impl BotJoinDecider {
    pub fn new(repos: &RepositoryFactory) -> Arc<dyn JoinDecider> {
        Arc::new(Self {
            membership_repo: repos.membership(),
            issuer_repo: repos.issuer(),
        })
    }
}

#[async_trait]
impl JoinDecider for BotJoinDecider {
    async fn decide(&self, request: &JoinRequest, issuer: &PeerId) -> JoinDecision {
        let Some(space_id) = request.space_id.clone() else {
            return reject("missing space_id", request);
        };
        let Some(subject_peer_id) = request.peer_id.clone() else {
            return reject("missing peer_id", request);
        };

        let role = SpaceRole::try_from(request.requested_role).unwrap_or(SpaceRole::Student);
        let now = SystemTime::now();
        let now_ts = Timestamp::from(now);
        let now_secs = epoch_seconds(now);

        // Optional: issuer delegation proof (owner → bot). If present, attach to membership.
        let issuer_cap = match self
            .issuer_repo
            .get(&space_id.value, &issuer.to_string())
            .await
        {
            Ok(Some(cap)) => cap
                .capability
                .and_then(|bytes: Vec<u8>| {
                    soma_proto_build::spaceroom::IssuerCapability::decode(bytes.as_slice()).ok()
                }),
            Ok(None) => None,
            Err(err) => {
                warn!(%err, "issuer_capability lookup failed");
                None
            }
        };

        let membership_cap = MembershipCapability {
            space_id: Some(space_id.clone()),
            subject_peer_id: Some(subject_peer_id.clone()),
            role: role as i32,
            permissions: Vec::new(),
            issued_at: Some(now_ts.clone()),
            expires_at: None,
            issuer_peer_id: Some(soma_proto_build::spaceroom::PeerId {
                value: issuer.to_string(),
            }),
            issuer_cap,
            signed: None,
        };

        let decision_id = format!("join-{:016x}", rand::random::<u64>());
        let decision = JoinDecision {
            decision_id: decision_id.clone(),
            space_id: Some(space_id.clone()),
            subject_peer_id: Some(subject_peer_id.clone()),
            decision: JoinDecisionType::JoinApproved as i32,
            reason: "approved".into(),
            capability: Some(membership_cap.clone()),
            created_at: Some(now_ts.clone()),
        };

        let membership_role = role_to_str(role);
        let membership_cap_bytes = membership_cap.encode_to_vec();

        // Best-effort persistence; failures do not block responding to the peer.
        if let Err(err) = self
            .membership_repo
            .upsert_space(&Space {
                space_id: space_id.value.clone(),
                display_name: None,
                created_at: now_secs,
            })
            .await
        {
            warn!(%err, "failed to upsert space while processing join");
        }

        if let Err(err) = self
            .membership_repo
            .upsert_membership(&SpaceMembership {
                space_id: space_id.value.clone(),
                subject_peer_id: subject_peer_id.value.clone(),
                role: membership_role.to_string(),
                issuer_peer_id: issuer.to_string(),
                issued_at: now_secs,
                expires_at: None,
                capability: Some(membership_cap_bytes.clone()),
            })
            .await
        {
            warn!(%err, "failed to upsert membership while processing join");
        }

        if let Err(err) = self
            .membership_repo
            .record_join_decision(&StoredDecision {
                decision_id,
                space_id: space_id.value.clone(),
                subject_peer_id: subject_peer_id.value.clone(),
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
}

fn reject(reason: &str, request: &JoinRequest) -> JoinDecision {
    let now = Timestamp::from(SystemTime::now());
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
        created_at: Some(now),
    }
}

fn role_to_str(role: SpaceRole) -> &'static str {
    match role {
        SpaceRole::Owner => "owner",
        SpaceRole::Editor => "editor",
        SpaceRole::Viewer => "viewer",
        SpaceRole::Student => "student",
        SpaceRole::Bot => "bot",
        SpaceRole::Unspecified => "unspecified",
    }
}

fn epoch_seconds(now: SystemTime) -> i64 {
    now.duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
