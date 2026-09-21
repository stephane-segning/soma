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
    RepositoryProvider, invites::InviteRepository, issuer::IssuerRepository,
    membership::MembershipRepository, peers::PeerPublicKeyRepository,
};
use tracing::warn;

use crate::{
    invite::try_auto_approve_via_invite,
    issuer::{check_issue_membership_scope, issuer_cap_valid},
    time::epoch_seconds,
    trust::StoragePeerKeyResolver,
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
    invite_repo: Arc<dyn InviteRepository>,
    peer_keys_repo: Arc<dyn PeerPublicKeyRepository>,
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
            invite_repo: repos.invite_repo(),
            peer_keys_repo: repos.peer_keys_repo(),
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

        // Bot recruitment: this decider previously delegated bot
        // authority directly TO the requester (via its own local
        // `issue_issuer_capability` call — see `self_issued_delegate_role`'s
        // doc comment for why this is safe ground truth and independent
        // of `self.policy`). Completing that recruitment into a real
        // `space_memberships` row is what lets a delegated bot actually
        // pass `SpaceAuthorizer::can_read_space` and mirror; ADR-0003
        // requires bots be "explicit space members", which nothing wrote
        // before this. Checked before the delegation-scope path below:
        // this is a distinct trust decision (traced to THIS decider's own
        // prior local action) from "I hold delegation FROM someone else".
        if let Some(role) = self
            .self_issued_delegate_role(&space_id, &subject_peer_id)
            .await
        {
            return approve_with_delegation(
                self.membership_repo.as_ref(),
                &self.signer,
                &self.local_peer_id,
                space_id,
                subject_peer_id,
                role,
                // Direct issuance: WE are the trust anchor for this
                // decision (we signed the delegation ourselves), so no
                // further delegation chain needs to travel with the
                // capability -- matches the `issuer_cap: None` branch in
                // `verify_capability_against_anchor`.
                None,
                now_ts,
                now_secs,
            )
            .await;
        }

        // Invite-based auto-approval: a JoinRequest carrying a proof over
        // an invite THIS decider itself issued (looked up purely from
        // local storage -- see `invite::try_auto_approve_via_invite`'s
        // doc comment), unexpired, unrevoked, and with an unconsumed
        // nonce, auto-approves at the invite's own `default_role`. A
        // distinct trust decision from the delegation path below (traces
        // to this decider's own prior `create_invite` call, not to a
        // signed capability chain), so it's checked independently, ahead
        // of the issuer-capability path -- cheap, local-only, no
        // resolver round trip.
        if let Some(role) =
            try_auto_approve_via_invite(self.invite_repo.as_ref(), &space_id.value, request, now)
                .await
        {
            return approve_with_delegation(
                self.membership_repo.as_ref(),
                &self.signer,
                &self.local_peer_id,
                space_id,
                subject_peer_id,
                role,
                None,
                now_ts,
                now_secs,
            )
            .await;
        }

        let loaded_cap = self.load_issuer_capability(&space_id).await;
        let auto_allowed = if self.policy.allow_auto_with_delegation {
            match loaded_cap.as_ref() {
                Some((cap, scopes)) => {
                    let resolver = StoragePeerKeyResolver::from_repo(self.peer_keys_repo.clone());
                    auto_approval_authorised(
                        cap,
                        scopes,
                        &space_id.value,
                        &self.local_peer_id,
                        role,
                        now,
                        &resolver,
                    )
                    .await
                }
                None => false,
            }
        } else {
            false
        };

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
/// when **all** of the following pass:
///   - the proto-level checks (`issuer_cap_valid`, which now also
///     verifies `IssuerCapability.signed` — see its doc comment; prior to
///     the membership-forgery fix this was a purely string/timestamp
///     check with no cryptographic verification at all), and
///   - the scope check (`check_issue_membership_scope`).
///
/// This mirrors the manual-approval path in `ensure_can_issue_membership`
/// (see `issuer.rs`), which combines the same two checks. Splitting it
/// into a standalone function lets the tests exercise the combined
/// predicate without spinning up the full `RepositoryProvider` +
/// `StorageBackedJoinDecider` machinery.
///
/// Empty scopes are treated as "no restriction" for backward compat — see
/// `scopes.rs` for the rationale (this does NOT apply to capabilities
/// ingested from the wire, which are written with
/// `scopes::SCOPE_PENDING_REVIEW` instead of an empty `Vec` precisely so
/// they don't fall into this backward-compat allowance).
async fn auto_approval_authorised(
    cap: &IssuerCapability,
    scopes: &[String],
    space_id: &str,
    local_peer_id: &PeerId,
    role: SpaceRole,
    now: SystemTime,
    resolver: &dyn crate::trust::PeerKeyResolver,
) -> bool {
    issuer_cap_valid(cap, space_id, local_peer_id, role, now, resolver).await
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

    /// Does `subject_peer_id` hold an issuer-capability delegation that
    /// THIS decider itself issued (`issuer_capabilities.issuer_peer_id ==
    /// local_peer_id`) for `space_id`? If so, return the `SpaceRole` the
    /// requester's own membership should carry.
    ///
    /// This is the ONLY safe local ground truth for auto-completing a
    /// bot's own join request without a second manual approval step: a
    /// row with `issuer_peer_id == local_peer_id` can only exist here
    /// because THIS process previously called `issue_issuer_capability`
    /// (a local-only operation reachable from the Tauri/HTTP command
    /// surface, gated on the caller already owning the space — see
    /// `issue_owned_issuer_capability_to_storage`) or the admin-HTTP
    /// issuer endpoints, both operator-authenticated actions. A remote
    /// peer has no write path that can plant a row shaped like that: the
    /// only network-reachable writer of `issuer_capabilities`
    /// (`IssuerInboundHandler` / `persist_inbound_capability`, ingesting
    /// `IssuerOfferReceived`) always stores the VERIFIED REMOTE sender as
    /// `issuer_peer_id`, and `local_peer_id` as `delegate_peer_id` --
    /// never the other way around. So this check can never be satisfied
    /// by anything the requester asserts about itself; it traces only to
    /// this decider's own prior local action, which is exactly what "the
    /// bot must not be able to self-grant; the grant has to trace to the
    /// owner" requires.
    ///
    /// The granted role is always [`SpaceRole::Bot`], independent of
    /// `request.requested_role` (untrusted input) and of the stored
    /// capability's `allowed_roles` (which governs what roles the BOT may
    /// in turn issue to others as a delegate -- a different concept, see
    /// `IssuerCapability`'s proto doc comment -- not the bot's own role).
    async fn self_issued_delegate_role(
        &self,
        space_id: &SpaceId,
        subject_peer_id: &soma_proto_build::space::PeerId,
    ) -> Option<SpaceRole> {
        let stored = self
            .issuer_repo
            .get(&space_id.value, &subject_peer_id.value)
            .await
            .ok()??;

        let issued_by_us = stored.issuer_peer_id == self.local_peer_id.to_string();
        let not_expired = stored
            .expires_at
            .map(|exp| exp > epoch_seconds(SystemTime::now()))
            .unwrap_or(true);

        (issued_by_us && not_expired).then_some(SpaceRole::Bot)
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
    //! bypass (#98), extended by the membership-forgery fix to also
    //! cover signature verification (`issuer_cap_valid` previously did
    //! zero cryptographic verification — see `issuer.rs`).
    //!
    //! We assert here on the extracted `auto_approval_authorised`
    //! predicate, which is the exact gate used in `decide()`. Building a
    //! full mock `RepositoryProvider` to round-trip through `decide()`
    //! would mostly exercise the storage layer; the bug lives in the
    //! predicate, so the predicate is what we test.
    use super::*;
    use crate::scopes::SCOPE_ISSUE_MEMBERSHIP;
    use crate::test_support::FixedKeyResolver;
    use libp2p::identity::Keypair;
    use soma_proto_build::space::{PeerId as ProtoPeerId, SpaceId as ProtoSpaceId};

    fn make_cap(space_id: &str, owner: &Keypair, issuer: &PeerId) -> IssuerCapability {
        let mut cap = IssuerCapability {
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
            owner_peer_id: Some(ProtoPeerId {
                value: owner.public().to_peer_id().to_string(),
            }),
            signed: None,
        };
        soma_common::sign_issuer_capability(&mut cap, owner).expect("sign issuer capability");
        cap
    }

    /// Fixture: a properly-signed capability plus a resolver that can
    /// resolve the signing owner's key — exercises the "everything is
    /// legitimate except scope" cases the pre-existing #98 tests target.
    fn fixture() -> (IssuerCapability, PeerId, FixedKeyResolver) {
        let owner = Keypair::generate_ed25519();
        let key = Keypair::generate_ed25519();
        let peer = key.public().to_peer_id();
        let cap = make_cap("space-1", &owner, &peer);
        let resolver = FixedKeyResolver(vec![(owner.public().to_peer_id(), owner.public())]);
        (cap, peer, resolver)
    }

    #[tokio::test]
    async fn auto_approval_blocked_when_scope_missing() {
        let (cap, peer, resolver) = fixture();
        // Proto-level checks (including signature) would pass, but the
        // stored scope is for a different action.
        let scopes = vec!["some-other-scope".to_string()];
        assert!(
            !auto_approval_authorised(
                &cap,
                &scopes,
                "space-1",
                &peer,
                SpaceRole::Member,
                SystemTime::UNIX_EPOCH,
                &resolver
            )
            .await,
            "auto-approval must be blocked when stored scopes do not include issue:membership"
        );
    }

    #[tokio::test]
    async fn auto_approval_allowed_with_explicit_scope() {
        let (cap, peer, resolver) = fixture();
        let scopes = vec![SCOPE_ISSUE_MEMBERSHIP.to_string()];
        assert!(
            auto_approval_authorised(
                &cap,
                &scopes,
                "space-1",
                &peer,
                SpaceRole::Member,
                SystemTime::UNIX_EPOCH,
                &resolver
            )
            .await,
            "auto-approval must succeed when the explicit issue:membership scope is present"
        );
    }

    #[tokio::test]
    async fn auto_approval_allowed_with_empty_scopes_for_backward_compat() {
        // Pre-#92 rows have NULL scopes (empty Vec on read). We
        // intentionally preserve them as "no restriction" — see the
        // doc comment on `scopes.rs` for the full rationale.
        let (cap, peer, resolver) = fixture();
        assert!(
            auto_approval_authorised(
                &cap,
                &[],
                "space-1",
                &peer,
                SpaceRole::Member,
                SystemTime::UNIX_EPOCH,
                &resolver
            )
            .await,
            "auto-approval must allow legacy rows with empty scopes (backward compat)"
        );
    }

    #[tokio::test]
    async fn auto_approval_still_blocked_when_proto_checks_fail_even_with_scope() {
        // Sanity: scope alone isn't enough; the proto-level gate
        // (`issuer_cap_valid`) must also pass. Here we pass the wrong
        // space_id so `issuer_cap_valid` returns false.
        let (cap, peer, resolver) = fixture();
        let scopes = vec![SCOPE_ISSUE_MEMBERSHIP.to_string()];
        assert!(
            !auto_approval_authorised(
                &cap,
                &scopes,
                "different-space",
                &peer,
                SpaceRole::Member,
                SystemTime::UNIX_EPOCH,
                &resolver
            )
            .await,
            "auto-approval must fail when the proto-level checks reject the cap"
        );
    }

    /// Mandatory regression test (auto-approval consumption point,
    /// end-to-end through the exact predicate `decide()` calls): a
    /// structurally valid but UNSIGNED capability must not auto-approve,
    /// even with a perfectly matching scope.
    #[tokio::test]
    async fn auto_approval_blocked_when_capability_unsigned() {
        let (mut cap, peer, resolver) = fixture();
        cap.signed = None;
        let scopes = vec![SCOPE_ISSUE_MEMBERSHIP.to_string()];
        assert!(
            !auto_approval_authorised(
                &cap,
                &scopes,
                "space-1",
                &peer,
                SpaceRole::Member,
                SystemTime::UNIX_EPOCH,
                &resolver
            )
            .await,
            "auto-approval must be blocked for an unsigned capability"
        );
    }

    // -----------------------------------------------------------------
    // Bot recruitment: self-issued-delegate auto-approval (item 2 —
    // "a bot never becomes a space member"). These exercise `decide()`
    // end-to-end through a full `FakeRepositoryProvider`, since the
    // behaviour under test is the wiring between "this decider already
    // holds a locally-issued delegation for the requester" and the
    // resulting `JoinDecision` + persisted `space_memberships` row —
    // unlike `auto_approval_authorised` above (which validates a
    // *remote* capability's signature, and so has meaningful pure
    // inputs), there's no smaller pure function to isolate this to.
    // -----------------------------------------------------------------

    use crate::test_support::FakeRepositoryProvider;
    use soma_storage::issuer::IssuerCapability as StoredIssuerCapability;

    fn join_request(space_id: &str, subject: &PeerId, requested_role: SpaceRole) -> JoinRequest {
        JoinRequest {
            space_id: Some(SpaceId {
                value: space_id.to_string(),
            }),
            peer_id: Some(ProtoPeerId {
                value: subject.to_string(),
            }),
            display_name: "bot".into(),
            device_name: String::new(),
            requester_code: String::new(),
            requested_role: requested_role as i32,
            invite_proof: None,
            created_at: Some(Timestamp::from(SystemTime::now())),
        }
    }

    /// The core item-2 fix: a peer this decider itself already delegated
    /// bot authority to (an `issuer_capabilities` row with
    /// `issuer_peer_id == local_peer_id`, written only by this decider's
    /// own prior `issue_issuer_capability` call) has its own `JoinRequest`
    /// auto-approved into a real `SpaceRole::Bot` membership — with NO
    /// dependency on `JoinPolicy` (`manual_only()` here, matching the
    /// desktop daemon's real policy for ordinary human join requests).
    #[tokio::test]
    async fn self_issued_delegate_auto_approves_into_bot_membership() {
        let local_key = Keypair::generate_ed25519();
        let local_peer_id = local_key.public().to_peer_id();
        let bot_peer = PeerId::random();

        let provider = FakeRepositoryProvider::default();
        provider.issuer.seed(StoredIssuerCapability {
            space_id: "space-1".into(),
            issuer_peer_id: local_peer_id.to_string(),
            delegate_peer_id: bot_peer.to_string(),
            issued_at: 0,
            expires_at: None,
            capability: None,
            alias: None,
            status: crate::bot_status::ACTIVE.to_string(),
            scopes: Vec::new(),
        });

        let decider = StorageBackedJoinDecider::new(
            &provider,
            local_key,
            local_peer_id,
            JoinPolicy::manual_only(),
        );

        let request = join_request("space-1", &bot_peer, SpaceRole::Member);
        let decision = decider.decide(&request, &local_peer_id).await;

        assert_eq!(
            decision.decision,
            JoinDecisionType::JoinApproved as i32,
            "reason: {}",
            decision.reason
        );
        let cap = decision
            .capability
            .as_ref()
            .expect("approved decision must carry a capability");
        assert_eq!(
            cap.role,
            SpaceRole::Bot as i32,
            "granted role must be Bot regardless of the requester's self-declared requested_role"
        );
        assert!(
            cap.issuer_cap.is_none(),
            "direct issuance by the trust anchor itself carries no delegation chain"
        );
        assert_eq!(
            cap.issuer_peer_id.as_ref().map(|p| p.value.as_str()),
            Some(local_peer_id.to_string()).as_deref()
        );

        let stored = provider
            .membership
            .get_membership("space-1", &bot_peer.to_string())
            .await
            .expect("get_membership")
            .expect("bot recruitment must persist a real space_memberships row");
        assert_eq!(stored.role, "bot");
        assert_eq!(stored.issuer_peer_id, local_peer_id.to_string());
    }

    /// A requester delegated by a DIFFERENT peer (not this decider) must
    /// not be auto-approved through the self-issued-delegate path — that
    /// would let a bot delegated elsewhere talk its way into membership
    /// here just by asserting a role. Falls through to ordinary manual
    /// pending review instead.
    #[tokio::test]
    async fn delegate_of_a_different_issuer_is_not_auto_approved() {
        let local_key = Keypair::generate_ed25519();
        let local_peer_id = local_key.public().to_peer_id();
        let someone_else = PeerId::random();
        let bot_peer = PeerId::random();

        let provider = FakeRepositoryProvider::default();
        provider.issuer.seed(StoredIssuerCapability {
            space_id: "space-1".into(),
            issuer_peer_id: someone_else.to_string(),
            delegate_peer_id: bot_peer.to_string(),
            issued_at: 0,
            expires_at: None,
            capability: None,
            alias: None,
            status: crate::bot_status::ACTIVE.to_string(),
            scopes: Vec::new(),
        });

        let decider = StorageBackedJoinDecider::new(
            &provider,
            local_key,
            local_peer_id,
            JoinPolicy::manual_only(),
        );

        let request = join_request("space-1", &bot_peer, SpaceRole::Bot);
        let decision = decider.decide(&request, &local_peer_id).await;

        assert_eq!(decision.decision, JoinDecisionType::JoinRejected as i32);
        assert_eq!(decision.reason, "pending manual approval");
        assert!(
            provider
                .membership
                .get_membership("space-1", &bot_peer.to_string())
                .await
                .expect("get_membership")
                .is_none(),
            "must not grant membership without a delegation this decider itself issued"
        );
    }

    /// An expired self-issued delegation must not auto-approve either.
    #[tokio::test]
    async fn expired_self_issued_delegate_is_not_auto_approved() {
        let local_key = Keypair::generate_ed25519();
        let local_peer_id = local_key.public().to_peer_id();
        let bot_peer = PeerId::random();

        let provider = FakeRepositoryProvider::default();
        provider.issuer.seed(StoredIssuerCapability {
            space_id: "space-1".into(),
            issuer_peer_id: local_peer_id.to_string(),
            delegate_peer_id: bot_peer.to_string(),
            issued_at: 0,
            // Expired one second ago.
            expires_at: Some(epoch_seconds(SystemTime::now()) - 1),
            capability: None,
            alias: None,
            status: crate::bot_status::ACTIVE.to_string(),
            scopes: Vec::new(),
        });

        let decider = StorageBackedJoinDecider::new(
            &provider,
            local_key,
            local_peer_id,
            JoinPolicy::manual_only(),
        );

        let request = join_request("space-1", &bot_peer, SpaceRole::Bot);
        let decision = decider.decide(&request, &local_peer_id).await;

        assert_eq!(decision.decision, JoinDecisionType::JoinRejected as i32);
    }
}
