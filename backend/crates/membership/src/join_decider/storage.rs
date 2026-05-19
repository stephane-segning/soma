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

use crate::{
    issuer::{check_issue_membership_scope, issuer_cap_valid},
    time::epoch_seconds,
};

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

        let loaded_cap = self.load_issuer_capability(&space_id).await;
        let auto_allowed = self.policy.allow_auto_with_delegation
            && loaded_cap.as_ref().map_or(false, |(cap, scopes)| {
                auto_approval_authorised(
                    cap,
                    scopes,
                    &space_id.value,
                    &self.local_peer_id,
                    role,
                    now_secs,
                )
            });

        let issuer_cap = loaded_cap.map(|(cap, _scopes)| cap);

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

/// Combined gate for the bot auto-approval path: a stored issuer
/// capability authorises this daemon to auto-approve a join request only
/// when **both** the proto-level checks (`issuer_cap_valid`) **and** the
/// scope check (`check_issue_membership_scope`) pass.
///
/// This mirrors the manual-approval path in
/// `ensure_can_issue_membership` (see `issuer.rs`), which combines the
/// same two checks. Splitting it into a standalone function lets the
/// tests exercise the combined predicate without spinning up the full
/// `RepositoryProvider` + `StorageBackedJoinDecider` machinery.
///
/// Empty scopes are treated as "no restriction" for backward compat —
/// see `scopes.rs` for the rationale.
fn auto_approval_authorised(
    cap: &IssuerCapability,
    scopes: &[String],
    space_id: &str,
    local_peer_id: &PeerId,
    role: SpaceRole,
    now_secs: i64,
) -> bool {
    issuer_cap_valid(cap, space_id, local_peer_id, role, now_secs)
        && check_issue_membership_scope(scopes).is_ok()
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

    /// Look up the locally-stored issuer capability for `(space_id,
    /// local_peer_id)` and return both the decoded proto and the row's
    /// `scopes` Vec. The scopes are needed alongside the proto so the
    /// auto-approval path in `decide` can run the same scope check that
    /// `ensure_can_issue_membership` runs on the manual path; returning
    /// only the proto (as the previous version did) silently dropped the
    /// scope information and bypassed enforcement.
    async fn load_issuer_capability(
        &self,
        space_id: &SpaceId,
    ) -> Option<(IssuerCapability, Vec<String>)> {
        match self
            .issuer_repo
            .get(&space_id.value, &self.local_peer_id.to_string())
            .await
        {
            Ok(Some(cap)) => {
                let scopes = cap.scopes.clone();
                cap.capability
                    .and_then(|bytes| IssuerCapability::decode(bytes.as_slice()).ok())
                    .map(|decoded| (decoded, scopes))
            }
            Ok(None) => None,
            Err(err) => {
                warn!(%err, "issuer_capability lookup failed");
                None
            }
        }
    }
}

#[cfg(test)]
mod tests {
    //! Regression tests for the bot auto-approval scope-enforcement
    //! bypass (#98). Prior to the fix, `decide()` validated the
    //! proto-level capability with `issuer_cap_valid` and proceeded to
    //! `approve_with_delegation` without ever consulting the stored
    //! row's `scopes` Vec. Only the *manual* path
    //! (`ensure_can_issue_membership`) gated on scopes.
    //!
    //! We assert here on the extracted `auto_approval_authorised`
    //! predicate, which is the exact gate used in `decide()`. Building
    //! a full mock `RepositoryProvider` to round-trip through
    //! `decide()` would mostly exercise the storage layer; the bug
    //! lives in the predicate, so the predicate is what we test.
    use super::*;
    use crate::scopes::SCOPE_ISSUE_MEMBERSHIP;
    use libp2p::identity::Keypair;
    use soma_proto_build::space::{PeerId as ProtoPeerId, SpaceId as ProtoSpaceId};

    fn make_cap(space_id: &str, issuer: &PeerId) -> IssuerCapability {
        IssuerCapability {
            space_id: Some(ProtoSpaceId {
                value: space_id.to_string(),
            }),
            issuer_peer_id: Some(ProtoPeerId {
                value: issuer.to_string(),
            }),
            allowed_roles: vec![SpaceRole::Member as i32],
            default_permissions: Vec::new(),
            issued_at: None,
            expires_at: None,
            max_member_expires_at: None,
            max_issues_per_hour: 0,
            owner_peer_id: None,
            signed: None,
        }
    }

    fn fixture() -> (IssuerCapability, PeerId) {
        let key = Keypair::generate_ed25519();
        let peer = key.public().to_peer_id();
        let cap = make_cap("space-1", &peer);
        (cap, peer)
    }

    #[test]
    fn auto_approval_blocked_when_scope_missing() {
        let (cap, peer) = fixture();
        // Proto-level checks would pass (space, issuer, role all
        // match) but the stored scope is for a different action.
        let scopes = vec!["some-other-scope".to_string()];
        assert!(
            !auto_approval_authorised(&cap, &scopes, "space-1", &peer, SpaceRole::Member, 0),
            "auto-approval must be blocked when stored scopes do not include issue:membership"
        );
    }

    #[test]
    fn auto_approval_allowed_with_explicit_scope() {
        let (cap, peer) = fixture();
        let scopes = vec![SCOPE_ISSUE_MEMBERSHIP.to_string()];
        assert!(
            auto_approval_authorised(&cap, &scopes, "space-1", &peer, SpaceRole::Member, 0),
            "auto-approval must succeed when the explicit issue:membership scope is present"
        );
    }

    #[test]
    fn auto_approval_allowed_with_empty_scopes_for_backward_compat() {
        // Pre-#92 rows have NULL scopes (empty Vec on read). We
        // intentionally preserve them as "no restriction" — see the
        // doc comment on `scopes.rs` for the full rationale.
        let (cap, peer) = fixture();
        assert!(
            auto_approval_authorised(&cap, &[], "space-1", &peer, SpaceRole::Member, 0),
            "auto-approval must allow legacy rows with empty scopes (backward compat)"
        );
    }

    #[test]
    fn auto_approval_still_blocked_when_proto_checks_fail_even_with_scope() {
        // Sanity: scope alone isn't enough; the proto-level gate
        // (`issuer_cap_valid`) must also pass. Here we pass the wrong
        // space_id so `issuer_cap_valid` returns false.
        let (cap, peer) = fixture();
        let scopes = vec![SCOPE_ISSUE_MEMBERSHIP.to_string()];
        assert!(
            !auto_approval_authorised(
                &cap,
                &scopes,
                "different-space",
                &peer,
                SpaceRole::Member,
                0
            ),
            "auto-approval must fail when the proto-level checks reject the cap"
        );
    }
}
