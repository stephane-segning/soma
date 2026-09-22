//! Verifying a membership someone *else* holds.
//!
//! Every other verification path in this crate answers "am I a member?"
//! — the capability's subject is always the local peer, and the
//! correlation gate in [`crate::verify_and_apply_inbound_join_decision`]
//! only ever admits a capability this process itself asked for. That is
//! why two non-owner members cannot authorize each other today: neither
//! has any way to learn, let alone check, that the other belongs.
//!
//! This module answers the different question: *"peer X handed me a
//! capability saying peer Y is a member — is that true?"* It is a
//! deliberately narrow and paranoid entry point.
//!
//! # Why this is safe to accept from a non-owner
//!
//! Nothing here trusts the peer that delivered the row. A membership
//! capability is signed by the space owner (or by a bot the owner
//! delegated to), over a CBOR view that commits to the space, the
//! subject and the role. Verification resolves the owner's key from the
//! **locally pinned trust anchor**, never from a field inside the
//! artifact being checked. So a relayed row is exactly as trustworthy
//! as one received first-hand, and a forged one fails the signature
//! check no matter who carries it.
//!
//! Two rules make that hold, and both are load-bearing:
//!
//! 1. **No trust-on-first-use.** [`resolve_trust_anchor`] falls back to
//!    trusting the peer in front of it when a space has no pinned
//!    owner. That is right for a join the local peer initiated, and
//!    catastrophic here: a stranger could hand over a self-signed row
//!    for an unknown space and pin *itself* as the owner. Roster
//!    ingestion therefore requires an already-pinned anchor and refuses
//!    otherwise.
//! 2. **Never rewrite our own membership.** The local peer's own row is
//!    the one thing it learned first-hand, through the correlated join
//!    path. A roster row claiming to describe us is refused outright
//!    rather than merged, so a peer cannot use the roster to promote or
//!    demote us.
//!
//! # The key-availability limit, stated rather than hidden
//!
//! `CborSigned.signer_public_key` is deliberately empty for everything
//! except invite links, so the signer's key has to come from
//! [`PeerKeyResolver`] — which in practice means a peer we have
//! completed a libp2p Identify exchange with. For the ordinary case
//! that is already satisfied: you join a space *through* its owner, so
//! you have dialled the owner and hold its key.
//!
//! A row signed by a delegated bot issuer you have never met cannot be
//! verified, and is refused. That is the correct failure direction —
//! you simply do not learn about that member until you meet the issuer
//! — but it does mean roster completeness is not guaranteed in spaces
//! that issue memberships through bots.

use std::time::SystemTime;

use libp2p::PeerId;
use soma_core::{Error, SomaResult};
use soma_proto_build::space::MembershipCapability;
use soma_storage::membership::{MembershipRepository, SpaceMembership};

use crate::roles::role_to_str;
use crate::trust::{PeerKeyResolver, verify_capability_against_anchor_for_subject};

/// Verify one roster row and turn it into a storable membership.
///
/// Returns the row to persist. Does not write: the caller decides what
/// to do with a verified row, and keeping the check side-effect-free
/// makes it testable in isolation.
pub async fn verify_third_party_membership(
    repo: &dyn MembershipRepository,
    resolver: &dyn PeerKeyResolver,
    local_peer_id: &PeerId,
    space_id: &str,
    cap: &MembershipCapability,
) -> SomaResult<SpaceMembership> {
    let cap_space = cap
        .space_id
        .as_ref()
        .map(|s| s.value.as_str())
        .unwrap_or_default();
    if cap_space.is_empty() || cap_space != space_id {
        return Err(Error::service(
            "roster entry is for a different space than the one requested",
        ));
    }

    let subject = cap
        .subject_peer_id
        .as_ref()
        .map(|p| p.value.as_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| Error::service("roster entry missing subject"))?;

    // Rule 2: our own row is not the roster's to describe.
    if subject == local_peer_id.to_string() {
        return Err(Error::service(
            "refusing a roster entry that claims to describe the local peer",
        ));
    }

    let subject_peer: PeerId = subject
        .parse()
        .map_err(|_| Error::service("roster entry subject peer id malformed"))?;

    // Rule 1: an already-pinned anchor, never trust-on-first-use. A
    // roster row must not be able to establish who owns a space.
    let anchor = crate::trust::pinned_trust_anchor(repo, space_id)
        .await?
        .ok_or_else(|| {
            Error::service("refusing a roster entry for a space with no pinned owner")
        })?;

    verify_capability_against_anchor_for_subject(
        cap,
        anchor,
        resolver,
        &subject_peer,
        SystemTime::now(),
    )
    .await?;

    let role = soma_proto_build::space::SpaceRole::try_from(cap.role)
        .map_err(|_| Error::service("roster entry has an unknown role"))?;
    let issuer_peer_id = cap
        .issuer_peer_id
        .as_ref()
        .map(|p| p.value.clone())
        .unwrap_or_default();

    Ok(SpaceMembership {
        space_id: space_id.to_string(),
        subject_peer_id: subject.to_string(),
        role: role_to_str(role).to_string(),
        issuer_peer_id,
        issued_at: cap.issued_at.as_ref().map(|t| t.seconds).unwrap_or(0),
        expires_at: cap.expires_at.as_ref().map(|t| t.seconds),
        capability: Some(prost::Message::encode_to_vec(cap)),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{FakeMembershipRepo, FixedKeyResolver};
    use libp2p::identity::Keypair;
    use prost_types::Timestamp;
    use soma_proto_build::space::{self, SpaceId, SpaceRole};
    use soma_storage::membership::Space;

    const SPACE: &str = "space-1";

    fn now_ts() -> Timestamp {
        Timestamp {
            seconds: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64,
            nanos: 0,
        }
    }

    /// A capability saying `subject` belongs to `space`, signed by
    /// `signer`. `signer` is the owner in the honest case and an
    /// attacker in the forgery cases.
    fn capability_for(
        space_id: &str,
        subject: &PeerId,
        signer: &Keypair,
    ) -> MembershipCapability {
        let signer_peer = signer.public().to_peer_id();
        let mut cap = MembershipCapability {
            space_id: Some(SpaceId {
                value: space_id.into(),
            }),
            subject_peer_id: Some(space::PeerId {
                value: subject.to_string(),
            }),
            role: SpaceRole::Member as i32,
            permissions: Vec::new(),
            issued_at: Some(now_ts()),
            expires_at: None,
            issuer_peer_id: Some(space::PeerId {
                value: signer_peer.to_string(),
            }),
            issuer_cap: None,
            signed: None,
        };
        soma_common::sign_membership_capability(&mut cap, signer).expect("sign");
        cap
    }

    fn pin_owner(repo: &FakeMembershipRepo, owner: &PeerId) {
        repo.spaces.lock().unwrap().insert(
            SPACE.to_string(),
            Space {
                space_id: SPACE.to_string(),
                display_name: Some("Space".into()),
                owner_peer_id: Some(owner.to_string()),
                created_at: 0,
            },
        );
    }

    #[tokio::test]
    async fn accepts_an_owner_signed_row_about_a_third_party() {
        let owner = Keypair::generate_ed25519();
        let owner_peer = owner.public().to_peer_id();
        let me = PeerId::random();
        let other = PeerId::random();

        let repo = FakeMembershipRepo::default();
        pin_owner(&repo, &owner_peer);
        let cap = capability_for(SPACE, &other, &owner);
        let resolver = FixedKeyResolver(vec![(owner_peer, owner.public())]);

        let row = verify_third_party_membership(&repo, &resolver, &me, SPACE, &cap)
            .await
            .expect("an owner-signed row about a third party should verify");
        assert_eq!(row.subject_peer_id, other.to_string());
        assert_eq!(row.space_id, SPACE);
        assert!(row.capability.is_some());
    }

    /// The forgery this whole module exists to stop: a member relaying
    /// a row it signed itself, for a peer the owner never admitted.
    #[tokio::test]
    async fn rejects_a_row_signed_by_anyone_but_the_pinned_owner() {
        let owner = Keypair::generate_ed25519();
        let owner_peer = owner.public().to_peer_id();
        let attacker = Keypair::generate_ed25519();
        let attacker_peer = attacker.public().to_peer_id();
        let me = PeerId::random();
        let victim = PeerId::random();

        let repo = FakeMembershipRepo::default();
        pin_owner(&repo, &owner_peer);
        let cap = capability_for(SPACE, &victim, &attacker);
        // The attacker's key resolves fine — being *known* is not being
        // *authorized*, which is exactly the distinction under test.
        let resolver = FixedKeyResolver(vec![
            (owner_peer, owner.public()),
            (attacker_peer, attacker.public()),
        ]);

        let err = verify_third_party_membership(&repo, &resolver, &me, SPACE, &cap)
            .await
            .expect_err("a self-signed row must not be accepted");
        assert!(
            err.to_string().contains("trusted owner"),
            "unexpected error: {err}"
        );
    }

    /// No trust-on-first-use. A roster row must never be able to
    /// establish who owns a space — otherwise a stranger pins itself.
    #[tokio::test]
    async fn rejects_a_row_for_a_space_with_no_pinned_owner() {
        let stranger = Keypair::generate_ed25519();
        let me = PeerId::random();
        let other = PeerId::random();

        let repo = FakeMembershipRepo::default(); // nothing pinned
        let cap = capability_for(SPACE, &other, &stranger);
        let resolver =
            FixedKeyResolver(vec![(stranger.public().to_peer_id(), stranger.public())]);

        let err = verify_third_party_membership(&repo, &resolver, &me, SPACE, &cap)
            .await
            .expect_err("must refuse to learn a roster for an unanchored space");
        assert!(
            err.to_string().contains("no pinned owner"),
            "unexpected error: {err}"
        );
        assert!(
            repo.spaces.lock().unwrap().is_empty(),
            "a refused roster entry must not pin an owner as a side effect"
        );
    }

    /// Our own membership is the one thing we learned first-hand. A
    /// roster must not be able to promote or demote us.
    #[tokio::test]
    async fn rejects_a_row_that_describes_the_local_peer() {
        let owner = Keypair::generate_ed25519();
        let owner_peer = owner.public().to_peer_id();
        let me = PeerId::random();

        let repo = FakeMembershipRepo::default();
        pin_owner(&repo, &owner_peer);
        // Genuinely owner-signed — it is refused for being about us,
        // not for being invalid.
        let cap = capability_for(SPACE, &me, &owner);
        let resolver = FixedKeyResolver(vec![(owner_peer, owner.public())]);

        let err = verify_third_party_membership(&repo, &resolver, &me, SPACE, &cap)
            .await
            .expect_err("a roster entry about the local peer must be refused");
        assert!(
            err.to_string().contains("local peer"),
            "unexpected error: {err}"
        );
    }

    #[tokio::test]
    async fn rejects_a_row_for_a_different_space() {
        let owner = Keypair::generate_ed25519();
        let owner_peer = owner.public().to_peer_id();
        let me = PeerId::random();
        let other = PeerId::random();

        let repo = FakeMembershipRepo::default();
        pin_owner(&repo, &owner_peer);
        // Validly signed, but for somewhere else — a peer must not be
        // able to smuggle a row from a space we cannot check into one
        // we can.
        let cap = capability_for("another-space", &other, &owner);
        let resolver = FixedKeyResolver(vec![(owner_peer, owner.public())]);

        let err = verify_third_party_membership(&repo, &resolver, &me, SPACE, &cap)
            .await
            .expect_err("a row for a different space must be refused");
        assert!(
            err.to_string().contains("different space"),
            "unexpected error: {err}"
        );
    }

    /// Fail closed when the signer's key is unknown. This is the
    /// documented limit: a row signed by a delegated issuer we have
    /// never Identify'd cannot be checked, so it is not accepted.
    #[tokio::test]
    async fn rejects_a_row_whose_signer_key_cannot_be_resolved() {
        let owner = Keypair::generate_ed25519();
        let owner_peer = owner.public().to_peer_id();
        let me = PeerId::random();
        let other = PeerId::random();

        let repo = FakeMembershipRepo::default();
        pin_owner(&repo, &owner_peer);
        let cap = capability_for(SPACE, &other, &owner);
        let resolver = FixedKeyResolver(Vec::new()); // nothing known

        let err = verify_third_party_membership(&repo, &resolver, &me, SPACE, &cap)
            .await
            .expect_err("an unresolvable signer must fail closed");
        assert!(
            err.to_string().contains("unavailable"),
            "unexpected error: {err}"
        );
    }

    /// Tampering after signing must not survive: the signature commits
    /// to the role, so an elevated copy fails.
    #[tokio::test]
    async fn rejects_a_row_whose_role_was_raised_after_signing() {
        let owner = Keypair::generate_ed25519();
        let owner_peer = owner.public().to_peer_id();
        let me = PeerId::random();
        let other = PeerId::random();

        let repo = FakeMembershipRepo::default();
        pin_owner(&repo, &owner_peer);
        let mut cap = capability_for(SPACE, &other, &owner);
        cap.role = SpaceRole::Owner as i32;
        let resolver = FixedKeyResolver(vec![(owner_peer, owner.public())]);

        verify_third_party_membership(&repo, &resolver, &me, SPACE, &cap)
            .await
            .expect_err("a post-signature role change must invalidate the row");
    }
}
