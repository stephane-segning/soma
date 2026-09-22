use std::time::SystemTime;

use libp2p::PeerId;
use prost::Message;
use soma_core::{Error, SomaResult};
use soma_proto_build::space::{JoinDecision, JoinDecisionType, SpaceRole};
use soma_storage::{
    mailbox::NewMailboxEntry,
    membership::{JoinDecision as StoredDecision, MembershipRepository, Space, SpaceMembership},
};

use crate::{
    outgoing_join_requests::MAILBOX_KIND_JOIN_DECISION,
    roles::role_to_str,
    time::epoch_seconds,
    trust::{PeerKeyResolver, pin_trust_anchor, resolve_trust_anchor},
};

pub async fn enqueue_outgoing_join_decision(
    repos: &dyn soma_storage::RepositoryProvider,
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

/// Verify an inbound `/soma/join-decision/1` message against local,
/// attacker-uncontrolled ground truth, then apply it.
///
/// This is the ONLY way to reach [`apply_join_decision`] from outside this
/// module — that function is `pub(crate)`, so a future caller elsewhere in
/// this crate can still reuse the low-level write, but no OTHER crate can
/// persist an inbound decision without first passing these checks; there
/// is no shortcut that skips straight from a raw `soma_peer::PeerEvent` to
/// a storage write. Concretely:
///
/// 1. **Correlation** (defence in depth): `from` must match the target of
///    an outgoing join request THIS peer itself created for `decision`'s
///    space (`MembershipRepository::find_outgoing_join_request`). An
///    attacker who was never asked to decide anything for us is rejected
///    before any capability is even inspected — see
///    `docs/src/security/threat-model.md` §"Unauthorized membership /
///    capability forgery". This is what actually closes the reported
///    exploit: an unsolicited push has no matching row here, full stop.
/// 2. **Trust anchor**: on an approved decision, the claimed issuer/owner
///    is checked against a locally pinned identity
///    (`spaces.owner_peer_id` via [`crate::trust::TrustAnchor`]), never
///    against a field inside the (attacker-authored) capability itself.
///    On first legitimate contact for a space, the correlated sender (or,
///    for a delegated capability, the owner it claims to be delegated by)
///    becomes the pinned anchor (trust-on-first-use); every later
///    decision must agree with it.
/// 3. **Signature + delegation chain**: verified via `soma_common`,
///    against public keys resolved through `resolver` — never through
///    fields the remote peer controls.
///
/// Rejections carry no capability and are recorded as an audit entry only
/// (via [`apply_join_decision`]) once correlation passes; nothing about a
/// bare rejection message is trusted enough to touch the trust anchor.
pub async fn verify_and_apply_inbound_join_decision(
    repo: &dyn MembershipRepository,
    resolver: &dyn PeerKeyResolver,
    from: &PeerId,
    local_peer_id: &PeerId,
    decision: &JoinDecision,
) -> SomaResult<()> {
    let space_id = decision
        .space_id
        .as_ref()
        .map(|s| s.value.as_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| Error::service("join decision missing space_id"))?;

    let outgoing = repo
        .find_outgoing_join_request(space_id, &from.to_string())
        .await?
        .ok_or_else(|| {
            Error::service("unsolicited join decision: no matching outgoing join request")
        })?;
    if outgoing.subject_peer_id != local_peer_id.to_string() {
        return Err(Error::service(
            "outgoing join request subject does not match local peer",
        ));
    }

    let is_approved =
        JoinDecisionType::try_from(decision.decision) == Ok(JoinDecisionType::JoinApproved);

    if is_approved {
        let cap = decision
            .capability
            .as_ref()
            .ok_or_else(|| Error::service("approved decision missing capability"))?;
        let anchor = resolve_trust_anchor(repo, space_id, from).await?;
        crate::trust::verify_capability_against_anchor_for_subject(
            cap,
            anchor,
            resolver,
            local_peer_id,
            SystemTime::now(),
        )
        .await?;
        pin_trust_anchor(repo, space_id, anchor).await?;
    }

    apply_join_decision(repo, decision).await
}

/// Apply an ALREADY-VERIFIED join decision to local storage: record the
/// audit entry, and on approval, upsert the space + membership row.
///
/// Deliberately `pub(crate)` — see
/// [`verify_and_apply_inbound_join_decision`]'s doc comment for why this
/// must not be directly reachable from outside this crate.
pub(crate) async fn apply_join_decision(
    repo: &dyn MembershipRepository,
    decision: &JoinDecision,
) -> SomaResult<()> {
    let Some(space_id) = decision.space_id.as_ref().map(|space| space.value.clone()) else {
        return Err(Error::service("missing decision.space_id"));
    };
    let Some(subject_peer_id) = decision
        .subject_peer_id
        .as_ref()
        .map(|peer| peer.value.clone())
    else {
        return Err(Error::service("missing decision.subject_peer_id"));
    };

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

    let issuer_peer_id = cap
        .issuer_peer_id
        .as_ref()
        .map(|peer| peer.value.clone())
        .unwrap_or_else(|| "unknown".into());

    let written = repo
        .upsert_membership(&SpaceMembership {
            space_id: space_id.clone(),
            subject_peer_id: subject_peer_id.clone(),
            role: role_to_str(SpaceRole::try_from(cap.role).unwrap_or(SpaceRole::Member))
                .to_string(),
            issuer_peer_id,
            issued_at,
            expires_at: cap.expires_at.as_ref().map(|timestamp| timestamp.seconds),
            capability: cap_bytes,
        })
        .await?;

    if !written {
        return Err(Error::service(
            "membership upsert rejected: an existing row for this subject has a different, unrelated issuer",
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use soma_proto_build::space::MembershipCapability;
    use crate::test_support::{FakeMembershipRepo, FixedKeyResolver};
    use libp2p::identity::Keypair;
    use prost_types::Timestamp;
    use soma_proto_build::space::{self, SpaceId};

    fn now_ts() -> Timestamp {
        Timestamp::from(SystemTime::now())
    }

    fn approved_decision(
        space_id: &str,
        subject: &PeerId,
        capability: MembershipCapability,
    ) -> JoinDecision {
        JoinDecision {
            decision_id: "join-test".into(),
            space_id: Some(SpaceId {
                value: space_id.to_string(),
            }),
            subject_peer_id: Some(space::PeerId {
                value: subject.to_string(),
            }),
            decision: JoinDecisionType::JoinApproved as i32,
            reason: "approved".into(),
            capability: Some(capability),
            created_at: Some(now_ts()),
        }
    }

    fn forged_owner_capability(
        attacker: &Keypair,
        subject: &PeerId,
        space_id: &str,
    ) -> MembershipCapability {
        let attacker_peer = attacker.public().to_peer_id();
        let mut cap = MembershipCapability {
            space_id: Some(SpaceId {
                value: space_id.to_string(),
            }),
            subject_peer_id: Some(space::PeerId {
                value: subject.to_string(),
            }),
            role: SpaceRole::Owner as i32,
            permissions: Vec::new(),
            issued_at: Some(now_ts()),
            expires_at: None,
            // Self-delegated: attacker claims to be the issuer.
            issuer_peer_id: Some(space::PeerId {
                value: attacker_peer.to_string(),
            }),
            issuer_cap: None,
            signed: None,
        };
        soma_common::sign_membership_capability(&mut cap, attacker).expect("self-sign");
        cap
    }

    /// Mandatory regression test: a fully self-signed, self-delegated
    /// forged `MembershipCapability` claiming OWNER is rejected, even when
    /// it is otherwise internally consistent (signature checks out,
    /// issuer == signer, subject matches). This is the exact exploit
    /// shape from the vulnerability report.
    #[tokio::test]
    async fn forged_self_delegated_owner_capability_is_rejected() {
        let attacker = Keypair::generate_ed25519();
        let attacker_peer = attacker.public().to_peer_id();
        let victim_peer = PeerId::random();

        let repo = FakeMembershipRepo::default();
        // Victim DID solicit this peer -- otherwise the correlation gate
        // alone would already reject it (see the next test) and this test
        // wouldn't isolate the anchor-binding fix.
        repo.seed_outgoing_request("space-1", &victim_peer, &attacker_peer);

        let cap = forged_owner_capability(&attacker, &victim_peer, "space-1");
        let decision = approved_decision("space-1", &victim_peer, cap);
        let resolver = FixedKeyResolver(vec![(attacker_peer, attacker.public())]);

        // First-ever contact for "space-1": naive TOFU would pin the
        // attacker as owner. But the capability claims role=OWNER for a
        // capability where signer==issuer==attacker, so this specific
        // scenario is exactly the "attacker IS the first (and only)
        // contact" case -- the true defence is fix #4 (correlation),
        // proven separately below. Here we additionally confirm that
        // once a DIFFERENT owner is already pinned, the same forged
        // capability is rejected on anchor grounds.
        repo.upsert_space(&Space {
            space_id: "space-1".into(),
            display_name: None,
            owner_peer_id: Some(PeerId::random().to_string()),
            created_at: 0,
        })
        .await
        .expect("pin real owner");

        let err = verify_and_apply_inbound_join_decision(
            &repo,
            &resolver,
            &attacker_peer,
            &victim_peer,
            &decision,
        )
        .await
        .expect_err("forged capability must be rejected");
        assert!(
            format!("{err}").contains("not this space's trusted owner"),
            "unexpected error: {err}"
        );
        assert!(
            repo.get_membership("space-1", &victim_peer.to_string())
                .await
                .expect("get_membership")
                .is_none(),
            "no membership row must be created for a rejected forgery"
        );
    }

    /// Mandatory regression test: an unsolicited `JoinDecision` -- no
    /// matching outgoing request at all -- is rejected outright, before
    /// any capability is even inspected. This is the primary defence
    /// against the reported exploit (any connectable peer pushing an
    /// unsolicited decision).
    #[tokio::test]
    async fn unsolicited_decision_with_no_matching_outgoing_request_is_rejected() {
        let attacker = Keypair::generate_ed25519();
        let attacker_peer = attacker.public().to_peer_id();
        let victim_peer = PeerId::random();

        let repo = FakeMembershipRepo::default();
        // Deliberately do NOT seed any outgoing request: the victim never
        // called JoinSpace targeting this peer for this space.

        let cap = forged_owner_capability(&attacker, &victim_peer, "space-1");
        let decision = approved_decision("space-1", &victim_peer, cap);
        let resolver = FixedKeyResolver(vec![(attacker_peer, attacker.public())]);

        let err = verify_and_apply_inbound_join_decision(
            &repo,
            &resolver,
            &attacker_peer,
            &victim_peer,
            &decision,
        )
        .await
        .expect_err("unsolicited decision must be rejected");
        assert!(
            format!("{err}").contains("unsolicited"),
            "unexpected error: {err}"
        );
        assert!(
            repo.get_space("space-1")
                .await
                .expect("get_space")
                .is_none(),
            "an unsolicited decision must not pin a trust anchor either"
        );
    }

    /// Mandatory regression test: an existing legitimate membership row is
    /// NOT overwritten by a conflicting inbound decision from a different,
    /// unrelated issuer -- even when that decision independently passes
    /// correlation + anchor verification for a *different* space trust
    /// anchor scenario (simulated here by exercising the storage-layer
    /// gate directly, which is the defence-in-depth layer described in
    /// `upsert_membership`'s doc comment).
    #[tokio::test]
    async fn existing_membership_is_not_overwritten_by_a_different_issuer() {
        let legit_issuer = PeerId::random();
        let other_issuer = PeerId::random();
        let subject = PeerId::random();

        let repo = FakeMembershipRepo::default();
        let original = SpaceMembership {
            space_id: "space-1".into(),
            subject_peer_id: subject.to_string(),
            role: "member".into(),
            issuer_peer_id: legit_issuer.to_string(),
            issued_at: 1,
            expires_at: None,
            capability: Some(vec![1, 2, 3]),
        };
        assert!(
            repo.upsert_membership(&original)
                .await
                .expect("initial insert"),
            "first write for a subject must always succeed"
        );

        let conflicting = SpaceMembership {
            role: "owner".into(),
            issuer_peer_id: other_issuer.to_string(),
            issued_at: 2,
            capability: Some(vec![9, 9, 9]),
            ..original.clone()
        };
        let written = repo
            .upsert_membership(&conflicting)
            .await
            .expect("conflicting write should not error");
        assert!(
            !written,
            "a write from a different, non-owner issuer must be rejected, not applied"
        );

        let stored = repo
            .get_membership("space-1", &subject.to_string())
            .await
            .expect("get_membership")
            .expect("row must still exist");
        assert_eq!(stored.role, "member", "role must be unchanged");
        assert_eq!(
            stored.issuer_peer_id,
            legit_issuer.to_string(),
            "issuer must be unchanged"
        );
        assert_eq!(
            stored.capability,
            Some(vec![1, 2, 3]),
            "capability bytes must be unchanged"
        );
    }

    /// Same-issuer renewal (e.g. an expiry refresh) must still succeed.
    #[tokio::test]
    async fn same_issuer_renewal_is_allowed() {
        let issuer = PeerId::random();
        let subject = PeerId::random();

        let repo = FakeMembershipRepo::default();
        let original = SpaceMembership {
            space_id: "space-1".into(),
            subject_peer_id: subject.to_string(),
            role: "member".into(),
            issuer_peer_id: issuer.to_string(),
            issued_at: 1,
            expires_at: None,
            capability: Some(vec![1]),
        };
        assert!(repo.upsert_membership(&original).await.expect("insert"));

        let renewal = SpaceMembership {
            issued_at: 2,
            expires_at: Some(9_999_999_999),
            capability: Some(vec![2]),
            ..original.clone()
        };
        assert!(
            repo.upsert_membership(&renewal)
                .await
                .expect("renewal should not error"),
            "the same issuer renewing must be allowed"
        );
    }

    /// The space's pinned owner can always override a delegate's earlier
    /// decision, even though the `issuer_peer_id` differs.
    #[tokio::test]
    async fn owner_override_of_a_delegate_issued_row_is_allowed() {
        let owner = PeerId::random();
        let delegate = PeerId::random();
        let subject = PeerId::random();

        let repo = FakeMembershipRepo::default();
        repo.upsert_space(&Space {
            space_id: "space-1".into(),
            display_name: None,
            owner_peer_id: Some(owner.to_string()),
            created_at: 0,
        })
        .await
        .expect("pin owner");

        let delegate_issued = SpaceMembership {
            space_id: "space-1".into(),
            subject_peer_id: subject.to_string(),
            role: "viewer".into(),
            issuer_peer_id: delegate.to_string(),
            issued_at: 1,
            expires_at: None,
            capability: Some(vec![1]),
        };
        assert!(
            repo.upsert_membership(&delegate_issued)
                .await
                .expect("insert")
        );

        let owner_override = SpaceMembership {
            role: "editor".into(),
            issuer_peer_id: owner.to_string(),
            issued_at: 2,
            capability: Some(vec![2]),
            ..delegate_issued.clone()
        };
        assert!(
            repo.upsert_membership(&owner_override)
                .await
                .expect("owner override should not error"),
            "the space owner must be able to override a delegate's row"
        );
    }

    /// A `MembershipCapability` with a structurally valid but ABSENT
    /// signature is rejected.
    #[tokio::test]
    async fn unsigned_membership_capability_is_rejected() {
        let issuer = Keypair::generate_ed25519();
        let issuer_peer = issuer.public().to_peer_id();
        let subject = PeerId::random();

        let repo = FakeMembershipRepo::default();
        repo.seed_outgoing_request("space-1", &subject, &issuer_peer);

        let cap = MembershipCapability {
            space_id: Some(SpaceId {
                value: "space-1".into(),
            }),
            subject_peer_id: Some(space::PeerId {
                value: subject.to_string(),
            }),
            role: SpaceRole::Member as i32,
            permissions: Vec::new(),
            issued_at: Some(now_ts()),
            expires_at: None,
            issuer_peer_id: Some(space::PeerId {
                value: issuer_peer.to_string(),
            }),
            issuer_cap: None,
            signed: None, // no signature at all
        };
        let decision = approved_decision("space-1", &subject, cap);
        let resolver = FixedKeyResolver(vec![(issuer_peer, issuer.public())]);

        let err = verify_and_apply_inbound_join_decision(
            &repo,
            &resolver,
            &issuer_peer,
            &subject,
            &decision,
        )
        .await
        .expect_err("unsigned capability must be rejected");
        assert!(
            format!("{err}").contains("missing signature"),
            "unexpected error: {err}"
        );
    }

    /// Sanity check: a legitimate, correlated, correctly-signed, directly
    /// (non-delegated) issued decision from the anchor IS applied. Proves
    /// the fix doesn't just fail everything closed.
    #[tokio::test]
    async fn legitimate_direct_decision_is_applied() {
        let owner = Keypair::generate_ed25519();
        let owner_peer = owner.public().to_peer_id();
        let subject = PeerId::random();

        let repo = FakeMembershipRepo::default();
        repo.seed_outgoing_request("space-1", &subject, &owner_peer);

        let mut cap = MembershipCapability {
            space_id: Some(SpaceId {
                value: "space-1".into(),
            }),
            subject_peer_id: Some(space::PeerId {
                value: subject.to_string(),
            }),
            role: SpaceRole::Member as i32,
            permissions: Vec::new(),
            issued_at: Some(now_ts()),
            expires_at: None,
            issuer_peer_id: Some(space::PeerId {
                value: owner_peer.to_string(),
            }),
            issuer_cap: None,
            signed: None,
        };
        soma_common::sign_membership_capability(&mut cap, &owner).expect("sign");
        let decision = approved_decision("space-1", &subject, cap);
        let resolver = FixedKeyResolver(vec![(owner_peer, owner.public())]);

        verify_and_apply_inbound_join_decision(&repo, &resolver, &owner_peer, &subject, &decision)
            .await
            .expect("legitimate decision should apply");

        let stored = repo
            .get_membership("space-1", &subject.to_string())
            .await
            .expect("get_membership")
            .expect("membership row must exist");
        assert_eq!(stored.role, "member");
        assert_eq!(stored.issuer_peer_id, owner_peer.to_string());
    }
}
