use std::time::SystemTime;

use async_trait::async_trait;
use libp2p::{PeerId, identity::Keypair};
use prost::Message;
use prost_types::Timestamp;
use soma_common::sign_membership_capability;
use soma_peer::join::JoinDecider;
use soma_proto_build::spaceroom::{
    JoinDecision, JoinDecisionType, JoinRequest, MembershipCapability, SpaceId, SpaceRole,
};
use soma_storage::{
    issuer::{IssuerRepository, SqlIssuerRepository},
    membership::{
        JoinDecision as StoredDecision, JoinRequest as StoredJoinRequest, MembershipRepository,
        SqlMembershipRepository, Space, SpaceMembership,
    },
    RepositoryFactory,
};
use tracing::warn;

#[derive(Clone, Debug)]
pub struct DaemonJoinDecider {
    membership_repo: SqlMembershipRepository,
    issuer_repo: SqlIssuerRepository,
    signer: Keypair,
    issuer_peer_id: PeerId,
    allow_auto_with_delegation: bool,
}

impl DaemonJoinDecider {
    pub fn new(
        repos: &RepositoryFactory,
        signer: Keypair,
        issuer_peer_id: PeerId,
        allow_auto_with_delegation: bool,
    ) -> Self {
        Self {
            membership_repo: repos.membership(),
            issuer_repo: repos.issuer(),
            signer,
            issuer_peer_id,
            allow_auto_with_delegation,
        }
    }
}

#[async_trait]
impl JoinDecider for DaemonJoinDecider {
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

        if let Ok(Some(stored)) = self
            .membership_repo
            .latest_join_decision(&space_id.value, &subject_peer_id.value)
            .await
        {
            if stored.decision == JoinDecisionType::JoinApproved as i32 {
                let decision = JoinDecision {
                    decision_id: stored.decision_id,
                    space_id: Some(SpaceId {
                        value: stored.space_id,
                    }),
                    subject_peer_id: Some(soma_proto_build::spaceroom::PeerId {
                        value: stored.subject_peer_id,
                    }),
                    decision: stored.decision,
                    reason: stored.reason.unwrap_or_else(|| "approved".into()),
                    capability: stored
                        .capability
                        .and_then(|bytes| MembershipCapability::decode(bytes.as_slice()).ok()),
                    created_at: Some(Timestamp {
                        seconds: stored.created_at,
                        nanos: 0,
                    }),
                };
                return decision;
            }

            if stored.decision == JoinDecisionType::JoinRejected as i32 {
                return JoinDecision {
                    decision_id: stored.decision_id,
                    space_id: Some(SpaceId {
                        value: stored.space_id,
                    }),
                    subject_peer_id: Some(soma_proto_build::spaceroom::PeerId {
                        value: stored.subject_peer_id,
                    }),
                    decision: stored.decision,
                    reason: stored.reason.unwrap_or_else(|| "rejected".into()),
                    capability: None,
                    created_at: Some(Timestamp {
                        seconds: stored.created_at,
                        nanos: 0,
                    }),
                };
            }
        }

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

        let auto_allowed = self.allow_auto_with_delegation && issuer_cap.as_ref().map_or(false, |cap| {
            issuer_cap_valid(cap, &space_id.value, &self.issuer_peer_id, role, now_secs)
        });

        if auto_allowed {
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
                issuer_peer_id: Some(soma_proto_build::spaceroom::PeerId {
                    value: issuer.to_string(),
                }),
                issuer_cap,
                signed: None,
            };

            if let Err(err) = sign_membership_capability(&mut membership_cap, &self.signer) {
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
                created_at: Some(now_ts.clone()),
            };

            let membership_role = role_to_str(role);
            let membership_cap_bytes = membership_cap.encode_to_vec();

            persist_membership(
                &self.membership_repo,
                &space_id.value,
                &subject_peer_id.value,
                &self.issuer_peer_id,
                membership_role,
                now_secs,
                membership_cap_bytes.clone(),
            )
            .await;

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
        } else {
            let request_id = format!("req-{:016x}", rand::random::<u64>());
            if let Err(err) = self
                .membership_repo
                .upsert_join_request(&StoredJoinRequest {
                    request_id: request_id.clone(),
                    space_id: space_id.value.clone(),
                    subject_peer_id: subject_peer_id.value.clone(),
                    display_name: request.display_name.clone(),
                    device_name: request.device_name.clone(),
                    requested_role: request.requested_role,
                    created_at: now_secs,
                    payload: Some(request.encode_to_vec()),
                })
                .await
            {
                warn!(%err, %request_id, "failed to persist join request");
            }

            reject("pending manual approval", request)
        }
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

pub(crate) fn role_to_str(role: SpaceRole) -> &'static str {
    match role {
        SpaceRole::Owner => "owner",
        SpaceRole::Editor => "editor",
        SpaceRole::Viewer => "viewer",
        SpaceRole::Student => "student",
        SpaceRole::Bot => "bot",
        SpaceRole::Unspecified => "unspecified",
    }
}

pub(crate) fn epoch_seconds(now: SystemTime) -> i64 {
    now.duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

pub(crate) async fn persist_membership(
    repo: &SqlMembershipRepository,
    space_id: &str,
    subject_peer_id: &str,
    issuer: &PeerId,
    role: &str,
    issued_at: i64,
    capability: Vec<u8>,
) {
    if let Err(err) = repo
        .upsert_space(&Space {
            space_id: space_id.to_string(),
            display_name: None,
            created_at: issued_at,
        })
        .await
    {
        warn!(%err, "failed to upsert space while processing join");
    }

    if let Err(err) = repo
        .upsert_membership(&SpaceMembership {
            space_id: space_id.to_string(),
            subject_peer_id: subject_peer_id.to_string(),
            role: role.to_string(),
            issuer_peer_id: issuer.to_string(),
            issued_at,
            expires_at: None,
            capability: Some(capability),
        })
        .await
    {
        warn!(%err, "failed to upsert membership while processing join");
    }
}

fn issuer_cap_valid(
    cap: &soma_proto_build::spaceroom::IssuerCapability,
    space_id: &str,
    issuer_peer_id: &PeerId,
    requested_role: SpaceRole,
    now_secs: i64,
) -> bool {
    let space_ok = cap
        .space_id
        .as_ref()
        .map(|s| s.value.as_str() == space_id)
        .unwrap_or(false);
    let issuer_ok = cap
        .issuer_peer_id
        .as_ref()
        .map(|p| p.value.as_str() == issuer_peer_id.to_string())
        .unwrap_or(false);
    let not_expired = cap
        .expires_at
        .as_ref()
        .map(|ts| ts.seconds > now_secs)
        .unwrap_or(true);
    let role_ok = cap.allowed_roles.is_empty()
        || cap
            .allowed_roles
            .iter()
            .any(|r| *r == requested_role as i32);

    space_ok && issuer_ok && not_expired && role_ok
}
