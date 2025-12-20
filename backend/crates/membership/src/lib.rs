use std::sync::Arc;
use std::time::SystemTime;

use async_trait::async_trait;
use libp2p::{PeerId, identity::Keypair};
use prost::Message;
use prost_types::Timestamp;
use soma_common::{sign_issuer_capability, sign_membership_capability};
use soma_core::{Error, SomaResult};
use soma_peer::join::JoinDecider;
use soma_proto_build::spaceroom::{
    IssuerCapability, JoinDecision, JoinDecisionType, JoinRequest, MembershipCapability, SpaceId,
    SpaceRole,
};
use soma_storage::{
    RepositoryFactory,
    issuer::{IssuerRepository, SqlIssuerRepository},
    mailbox::{MailboxRepository, NewMailboxEntry},
    membership::{
        JoinDecision as StoredDecision, JoinRequest as StoredJoinRequest, MembershipRepository,
        SqlMembershipRepository, Space, SpaceMembership,
    },
};
use tracing::warn;

#[derive(Clone)]
pub struct JoinPolicy {
    pub allow_auto_with_delegation: bool,
}

impl JoinPolicy {
    pub fn bot_auto() -> Self {
        Self {
            allow_auto_with_delegation: true,
        }
    }

    pub fn manual_only() -> Self {
        Self {
            allow_auto_with_delegation: false,
        }
    }
}

pub fn build_join_decider(
    repos: &RepositoryFactory,
    signer: Keypair,
    local_peer_id: PeerId,
    policy: JoinPolicy,
) -> Arc<dyn JoinDecider> {
    Arc::new(StorageBackedJoinDecider::new(
        repos, signer, local_peer_id, policy,
    ))
}

#[derive(Clone)]
struct StorageBackedJoinDecider {
    membership_repo: SqlMembershipRepository,
    issuer_repo: SqlIssuerRepository,
    signer: Keypair,
    local_peer_id: PeerId,
    policy: JoinPolicy,
}

impl StorageBackedJoinDecider {
    fn new(
        repos: &RepositoryFactory,
        signer: Keypair,
        local_peer_id: PeerId,
        policy: JoinPolicy,
    ) -> Self {
        Self {
            membership_repo: repos.membership(),
            issuer_repo: repos.issuer(),
            signer,
            local_peer_id,
            policy,
        }
    }
}

#[async_trait]
impl JoinDecider for StorageBackedJoinDecider {
    async fn decide(&self, request: &JoinRequest, _issuer: &PeerId) -> JoinDecision {
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

        // If a previous decision exists, reuse it (idempotent behaviour for re-tries).
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
            .get(&space_id.value, &self.local_peer_id.to_string())
            .await
        {
            Ok(Some(cap)) => cap
                .capability
                .and_then(|bytes: Vec<u8>| IssuerCapability::decode(bytes.as_slice()).ok()),
            Ok(None) => None,
            Err(err) => {
                warn!(%err, "issuer_capability lookup failed");
                None
            }
        };

        let auto_allowed =
            self.policy.allow_auto_with_delegation && issuer_cap.as_ref().map_or(false, |cap| {
                issuer_cap_valid(cap, &space_id.value, &self.local_peer_id, role, now_secs)
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
                    value: self.local_peer_id.to_string(),
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
                &self.local_peer_id,
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
            // Persist pending request for manual approval.
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

pub async fn list_pending_join_requests(repos: &RepositoryFactory) -> SomaResult<Vec<StoredJoinRequest>> {
    repos.membership().list_join_requests().await
}

pub async fn decide_join_request(
    repos: &RepositoryFactory,
    signer: &Keypair,
    issuer_peer_id: &PeerId,
    request_id: &str,
    approve: bool,
    role_override: Option<SpaceRole>,
    reason: Option<String>,
) -> SomaResult<JoinDecision> {
    let repo = repos.membership();
    let req = repo
        .get_join_request(request_id)
        .await?
        .ok_or_else(|| Error::service("join request not found"))?;

    let role_i32 = role_override.map(|r| r as i32).unwrap_or(req.requested_role);
    let role = SpaceRole::try_from(role_i32).unwrap_or(SpaceRole::Student);

    let now = SystemTime::now();
    let now_ts = Timestamp::from(now);
    let now_secs = epoch_seconds(now);

    let mut membership_cap = MembershipCapability {
        space_id: Some(SpaceId {
            value: req.space_id.clone(),
        }),
        subject_peer_id: Some(soma_proto_build::spaceroom::PeerId {
            value: req.subject_peer_id.clone(),
        }),
        role: role as i32,
        permissions: Vec::new(),
        issued_at: Some(now_ts.clone()),
        expires_at: None,
        issuer_peer_id: Some(soma_proto_build::spaceroom::PeerId {
            value: issuer_peer_id.to_string(),
        }),
        issuer_cap: None,
        signed: None,
    };

    if approve {
        sign_membership_capability(&mut membership_cap, signer)?;
    }

    let decision = JoinDecision {
        decision_id: format!("join-{:016x}", rand::random::<u64>()),
        space_id: Some(SpaceId {
            value: req.space_id.clone(),
        }),
        subject_peer_id: Some(soma_proto_build::spaceroom::PeerId {
            value: req.subject_peer_id.clone(),
        }),
        decision: if approve {
            JoinDecisionType::JoinApproved as i32
        } else {
            JoinDecisionType::JoinRejected as i32
        },
        reason: reason.unwrap_or_else(|| "manual decision".into()),
        capability: if approve {
            Some(membership_cap.clone())
        } else {
            None
        },
        created_at: Some(now_ts),
    };

    if approve {
        let cap_bytes = membership_cap.encode_to_vec();
        persist_membership(
            &repo,
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
    } else {
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

    let _ = repo.delete_join_request(request_id).await;

    Ok(decision)
}

pub async fn create_space(
    repos: &RepositoryFactory,
    owner_peer_id: &PeerId,
    space_id: &str,
    display_name: Option<String>,
) -> SomaResult<()> {
    let now_secs = epoch_seconds(SystemTime::now());
    repos
        .membership()
        .upsert_space(&Space {
            space_id: space_id.to_string(),
            display_name,
            owner_peer_id: Some(owner_peer_id.to_string()),
            created_at: now_secs,
        })
        .await
}

pub async fn issue_issuer_capability_to_storage(
    repos: &RepositoryFactory,
    signer: &Keypair,
    owner_peer_id: &PeerId,
    space_id: &str,
    delegate_peer_id: &PeerId,
    allowed_roles: Vec<SpaceRole>,
    expires_at_secs: Option<i64>,
) -> SomaResult<IssuerCapability> {
    let now = SystemTime::now();
    let now_ts = Timestamp::from(now);
    let now_secs = epoch_seconds(now);

    let mut issuer_cap = IssuerCapability {
        space_id: Some(SpaceId {
            value: space_id.to_string(),
        }),
        issuer_peer_id: Some(soma_proto_build::spaceroom::PeerId {
            value: delegate_peer_id.to_string(),
        }),
        allowed_roles: allowed_roles.into_iter().map(|r| r as i32).collect(),
        default_permissions: Vec::new(),
        issued_at: Some(now_ts.clone()),
        expires_at: expires_at_secs.map(|secs| Timestamp {
            seconds: secs,
            nanos: 0,
        }),
        max_member_expires_at: None,
        max_issues_per_hour: 0,
        owner_peer_id: Some(soma_proto_build::spaceroom::PeerId {
            value: owner_peer_id.to_string(),
        }),
        signed: None,
    };

    sign_issuer_capability(&mut issuer_cap, signer)?;

    let bytes = issuer_cap.encode_to_vec();
    repos
        .issuer()
        .upsert(&soma_storage::issuer::IssuerCapability {
            space_id: space_id.to_string(),
            issuer_peer_id: owner_peer_id.to_string(),
            delegate_peer_id: delegate_peer_id.to_string(),
            issued_at: now_secs,
            expires_at: expires_at_secs,
            capability: Some(bytes),
        })
        .await?;

    Ok(issuer_cap)
}

pub fn parse_role_str(role: &str) -> Option<SpaceRole> {
    match role.to_lowercase().as_str() {
        "owner" => Some(SpaceRole::Owner),
        "editor" => Some(SpaceRole::Editor),
        "viewer" => Some(SpaceRole::Viewer),
        "bot" => Some(SpaceRole::Bot),
        "student" => Some(SpaceRole::Student),
        _ => None,
    }
}

pub fn role_to_str(role: SpaceRole) -> &'static str {
    match role {
        SpaceRole::Owner => "owner",
        SpaceRole::Editor => "editor",
        SpaceRole::Viewer => "viewer",
        SpaceRole::Student => "student",
        SpaceRole::Bot => "bot",
        SpaceRole::Unspecified => "unspecified",
    }
}

pub const MAILBOX_KIND_JOIN_DECISION: &str = "join_decision";

pub async fn enqueue_outgoing_join_decision(
    repos: &RepositoryFactory,
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
        .mailbox()
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

pub async fn apply_join_decision(repos: &RepositoryFactory, decision: &JoinDecision) -> SomaResult<()> {
    let Some(space_id) = decision.space_id.as_ref().map(|s| s.value.clone()) else {
        return Err(Error::service("missing decision.space_id"));
    };
    let Some(subject_peer_id) = decision
        .subject_peer_id
        .as_ref()
        .map(|p| p.value.clone())
    else {
        return Err(Error::service("missing decision.subject_peer_id"));
    };

    let repo = repos.membership();
    let now_secs = epoch_seconds(SystemTime::now());

    let cap_bytes = decision
        .capability
        .as_ref()
        .map(|cap| cap.encode_to_vec());

    repo.record_join_decision(&StoredDecision {
        decision_id: decision.decision_id.clone(),
        space_id: space_id.clone(),
        subject_peer_id: subject_peer_id.clone(),
        decision: decision.decision,
        reason: Some(decision.reason.clone()),
        created_at: decision
            .created_at
            .as_ref()
            .map(|t| t.seconds)
            .unwrap_or(now_secs),
        capability: cap_bytes.clone(),
    })
    .await?;

    let decision_type =
        JoinDecisionType::try_from(decision.decision).unwrap_or(JoinDecisionType::JoinRejected);

    if decision_type == JoinDecisionType::JoinApproved {
        let cap = decision
            .capability
            .as_ref()
            .ok_or_else(|| Error::service("approved decision missing capability"))?;

        let issuer_peer_id = cap
            .issuer_peer_id
            .as_ref()
            .map(|p| p.value.clone())
            .unwrap_or_else(|| "unknown".into());
        let role = SpaceRole::try_from(cap.role).unwrap_or(SpaceRole::Student);
        let issued_at = cap
            .issued_at
            .as_ref()
            .map(|t| t.seconds)
            .unwrap_or(now_secs);
        let expires_at = cap.expires_at.as_ref().map(|t| t.seconds);

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
            role: role_to_str(role).to_string(),
            issuer_peer_id,
            issued_at,
            expires_at,
            capability: cap_bytes,
        })
        .await?;
    }

    Ok(())
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

fn epoch_seconds(now: SystemTime) -> i64 {
    now.duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn issuer_cap_valid(
    cap: &IssuerCapability,
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

async fn persist_membership(
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
            owner_peer_id: None,
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
