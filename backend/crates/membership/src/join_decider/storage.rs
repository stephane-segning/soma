use std::sync::Arc;
use std::time::SystemTime;

use async_trait::async_trait;
use libp2p::{PeerId, identity::Keypair};
use prost::Message;
use prost_types::Timestamp;
use soma_peer::join::JoinDecider;
use soma_proto_build::space::{
    IssuerCapability, JoinDecision, JoinDecisionType, JoinRequest, SpaceId, SpaceRole,
};
use soma_storage::{
    RepositoryProvider, issuer::IssuerRepository, membership::MembershipRepository,
};
use tracing::warn;

use crate::{issuer::issuer_cap_valid, time::epoch_seconds};

use super::{
    approval::approve_with_delegation,
    decisions::{reject, stored_decision},
    pending::record_pending_request,
    policy::JoinPolicy,
};

pub fn build_join_decider(
    repos: &dyn RepositoryProvider,
    signer: Keypair,
    local_peer_id: PeerId,
    policy: JoinPolicy,
) -> Arc<dyn JoinDecider> {
    Arc::new(StorageBackedJoinDecider::new(
        repos,
        signer,
        local_peer_id,
        policy,
    ))
}

#[derive(Clone)]
struct StorageBackedJoinDecider {
    membership_repo: Arc<dyn MembershipRepository>,
    issuer_repo: Arc<dyn IssuerRepository>,
    signer: Keypair,
    local_peer_id: PeerId,
    policy: JoinPolicy,
}

impl StorageBackedJoinDecider {
    fn new(
        repos: &dyn RepositoryProvider,
        signer: Keypair,
        local_peer_id: PeerId,
        policy: JoinPolicy,
    ) -> Self {
        Self {
            membership_repo: repos.membership_repo(),
            issuer_repo: repos.issuer_repo(),
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

        let role = SpaceRole::try_from(request.requested_role).unwrap_or(SpaceRole::Member);
        let now = SystemTime::now();
        let now_ts = Timestamp::from(now);
        let now_secs = epoch_seconds(now);

        if let Some(decision) = self
            .replay_latest_decision(&space_id, &subject_peer_id)
            .await
        {
            return decision;
        }

        let issuer_cap = self.load_issuer_capability(&space_id).await;
        let auto_allowed = self.policy.allow_auto_with_delegation
            && issuer_cap.as_ref().map_or(false, |cap| {
                issuer_cap_valid(cap, &space_id.value, &self.local_peer_id, role, now_secs)
            });

        if auto_allowed {
            approve_with_delegation(
                self.membership_repo.as_ref(),
                &self.signer,
                &self.local_peer_id,
                space_id,
                subject_peer_id,
                role,
                issuer_cap,
                now_ts,
                now_secs,
            )
            .await
        } else {
            record_pending_request(
                self.membership_repo.as_ref(),
                &self.local_peer_id,
                request,
                &space_id,
                &subject_peer_id,
                now_secs,
            )
            .await;
            reject("pending manual approval", request)
        }
    }
}

impl StorageBackedJoinDecider {
    async fn replay_latest_decision(
        &self,
        space_id: &SpaceId,
        subject_peer_id: &soma_proto_build::space::PeerId,
    ) -> Option<JoinDecision> {
        let stored = self
            .membership_repo
            .latest_join_decision(&space_id.value, &subject_peer_id.value)
            .await
            .ok()
            .flatten()?;

        match JoinDecisionType::try_from(stored.decision) {
            Ok(JoinDecisionType::JoinApproved) => Some(stored_decision(stored, "approved", true)),
            Ok(JoinDecisionType::JoinRejected) => Some(stored_decision(stored, "rejected", false)),
            _ => None,
        }
    }

    async fn load_issuer_capability(&self, space_id: &SpaceId) -> Option<IssuerCapability> {
        match self
            .issuer_repo
            .get(&space_id.value, &self.local_peer_id.to_string())
            .await
        {
            Ok(Some(cap)) => cap
                .capability
                .and_then(|bytes| IssuerCapability::decode(bytes.as_slice()).ok()),
            Ok(None) => None,
            Err(err) => {
                warn!(%err, "issuer_capability lookup failed");
                None
            }
        }
    }
}
