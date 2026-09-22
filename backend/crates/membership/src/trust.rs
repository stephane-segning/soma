//! Ground-truth trust anchoring for space ownership.
//!
//! # The problem this module closes
//!
//! Signature verification alone (`soma_common::verify_membership_capability*`)
//! only proves a capability is *internally self-consistent*: the signer
//! really did sign these exact bytes, and the payload really does claim
//! `issuer_peer_id == signer_peer_id`. It never proves the signer is
//! actually the space's owner (or a peer the owner actually delegated to)
//! — every field being cross-checked can live inside the same
//! attacker-authored payload. See `docs/src/security/threat-model.md`
//! §"Unauthorized membership / capability forgery" and
//! `docs/src/space-authorization-model.md`.
//!
//! # The fix
//!
//! A [`TrustAnchor`] is the *only* input this crate accepts for "who do we
//! trust to speak for this space". It is constructed exclusively from
//! local, attacker-uncontrolled state:
//!
//!   - a value already pinned in `spaces.owner_peer_id` (immutable once
//!     set — `MembershipRepository::upsert_membership`'s SQL and
//!     `upsert_space`'s `COALESCE` both protect it), or
//!   - on first legitimate contact for a space (no pin yet), the peer this
//!     process itself deliberately targeted with its own prior outgoing
//!     request (trust-on-first-use).
//!
//! Never from a field read out of the very capability being verified.
//!
//! Distributing the owner-signed `SpaceGenesisArtifact` over the wire
//! (which would let a receiver verify ownership independently of any
//! TOFU step) is out of scope for this fix — see the residual-risk note in
//! the fix report. This module implements the strongest local-pinning
//! version achievable without it.

use std::time::SystemTime;

use async_trait::async_trait;
use libp2p::PeerId;
use libp2p::identity::PublicKey;
use soma_common::{verify_membership_capability, verify_membership_capability_with_owner_key};
use soma_core::{Error, SomaResult};
use soma_proto_build::space::{IssuerCapability, MembershipCapability};
use soma_storage::membership::{MembershipRepository, Space};

use crate::time::epoch_seconds;

/// Resolves the authenticated libp2p public key for a peer — e.g. from a
/// prior Identify exchange, cached in memory and/or persisted to storage.
///
/// `None` means "unknown". Every caller of a function that takes a
/// `&dyn PeerKeyResolver` MUST treat that as a verification failure; it is
/// never safe to substitute a default key or skip the check.
#[async_trait]
pub trait PeerKeyResolver: Send + Sync {
    async fn resolve(&self, peer: &PeerId) -> Option<PublicKey>;
}

/// A space's owning identity, established from local state the remote
/// peer does not control.
///
/// This type exists so verification entry points in this crate
/// ([`verify_inbound_issuer_capability`] here, and
/// [`crate::verify_and_apply_inbound_join_decision`]) are the only way to
/// reach a membership/issuer-capability write: there is no code path in
/// this crate that verifies a remote capability using an owner identity
/// read directly out of that same capability's own fields. Constructing
/// one requires [`resolve_trust_anchor`], which only ever reads from
/// storage or from a candidate the caller asserts came from its own prior
/// local action (see call sites).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TrustAnchor(PeerId);

impl TrustAnchor {
    pub fn peer_id(&self) -> PeerId {
        self.0
    }
}

/// Resolve the trust anchor for `space_id`: the pinned
/// `spaces.owner_peer_id` if one exists, otherwise `candidate` (TOFU on
/// first legitimate contact). Does not persist anything — see
/// [`pin_trust_anchor`].
///
/// `candidate` must be an identity the caller has independent local
/// grounds to trust for a *first* contact (e.g. the target of the
/// caller's own prior outgoing join request, or the sender of a
/// self-claimed issuer offer whose claim has already been checked for
/// self-consistency) — this function does not itself validate that; it
/// only refuses to let a *later* message silently override an
/// already-pinned anchor.
pub(crate) async fn resolve_trust_anchor(
    repo: &dyn MembershipRepository,
    space_id: &str,
    candidate: &PeerId,
) -> SomaResult<TrustAnchor> {
    let pinned = repo
        .get_space(space_id)
        .await?
        .and_then(|space| space.owner_peer_id);

    match pinned {
        Some(owner) => owner
            .parse::<PeerId>()
            .map(TrustAnchor)
            .map_err(|_| Error::service("pinned space owner peer id is malformed")),
        None => Ok(TrustAnchor(*candidate)),
    }
}

/// Pin `anchor` as `space_id`'s owner if nothing is pinned yet. Immutable
/// thereafter: `MembershipRepository`'s `upsert_space` COALESCEs
/// `owner_peer_id`, so an existing non-null value always wins over this
/// call, regardless of what `anchor` is on a later invocation.
pub(crate) async fn pin_trust_anchor(
    repo: &dyn MembershipRepository,
    space_id: &str,
    anchor: TrustAnchor,
) -> SomaResult<()> {
    repo.upsert_space(&Space {
        space_id: space_id.to_string(),
        display_name: None,
        owner_peer_id: Some(anchor.0.to_string()),
        created_at: epoch_seconds(SystemTime::now()),
    })
    .await
}

/// The pinned owner of `space_id`, or `None` if nothing is pinned yet.
///
/// Unlike [`resolve_trust_anchor`] this never falls back to trusting a
/// candidate peer. Trust-on-first-use is right when the local peer
/// initiated the exchange, and dangerous when it did not: a stranger
/// offering a roster for an unknown space would otherwise pin itself as
/// that space's owner. Callers ingesting third-party claims use this
/// and refuse on `None`.
pub(crate) async fn pinned_trust_anchor(
    repo: &dyn MembershipRepository,
    space_id: &str,
) -> SomaResult<Option<TrustAnchor>> {
    let Some(owner) = repo
        .get_space(space_id)
        .await?
        .and_then(|space| space.owner_peer_id)
    else {
        return Ok(None);
    };
    owner
        .parse::<PeerId>()
        .map(|p| Some(TrustAnchor(p)))
        .map_err(|_| Error::service("pinned space owner peer id is malformed"))
}

/// Verify a membership capability against a space's pinned owner.
///
/// `subject_peer_id` is who the capability is expected to be *about*.
/// For the join path that is always the local peer; roster replication
/// passes the third party the row describes. Nothing else differs —
/// which is the point: a relayed row is checked exactly as strictly as
/// a first-hand one, because the trust anchor and the signer's key both
/// come from local state rather than from the artifact.
pub(crate) async fn verify_capability_against_anchor_for_subject(
    cap: &MembershipCapability,
    anchor: TrustAnchor,
    resolver: &dyn PeerKeyResolver,
    subject_peer_id: &PeerId,
    now: SystemTime,
) -> SomaResult<()> {
    let signed = cap
        .signed
        .as_ref()
        .ok_or_else(|| Error::service("membership capability missing signature"))?;
    let signer_peer_id: PeerId = signed
        .signer_peer_id
        .as_ref()
        .map(|p| p.value.as_str())
        .unwrap_or_default()
        .parse()
        .map_err(|_| Error::service("membership capability signer peer id malformed"))?;
    let signer_pub: PublicKey = resolver
        .resolve(&signer_peer_id)
        .await
        .ok_or_else(|| Error::service("membership signer public key unavailable"))?;

    match cap.issuer_cap.as_ref() {
        None => {
            // Direct issuance: the issuer must actually BE the pinned
            // anchor, not merely self-consistent with the payload's own
            // `signer_peer_id` field (that self-consistency check is all
            // `soma_common::verify_membership_capability` does on its
            // own -- see its doc comment).
            if signer_peer_id != anchor.peer_id() {
                return Err(Error::service(
                    "membership issuer is not this space's trusted owner",
                ));
            }
            verify_membership_capability(cap, &signer_pub, subject_peer_id, now)
        }
        Some(issuer_cap) => {
            // Delegated issuance: the *owner* claimed inside issuer_cap
            // must match the pinned anchor. We resolve the anchor's real
            // key ourselves via `resolver` rather than trusting whatever
            // key the attacker-controlled `owner_peer_id` field points at
            // -- this is the exact bug `issuer_owner_public_key` had.
            let claimed_owner = issuer_cap
                .owner_peer_id
                .as_ref()
                .map(|p| p.value.as_str())
                .unwrap_or_default();
            if claimed_owner != anchor.peer_id().to_string() {
                return Err(Error::service(
                    "issuer capability owner does not match this space's trusted owner",
                ));
            }
            let owner_pub = resolver
                .resolve(&anchor.peer_id())
                .await
                .ok_or_else(|| Error::service("space owner public key unavailable"))?;
            verify_membership_capability_with_owner_key(
                cap,
                &signer_pub,
                &owner_pub,
                subject_peer_id,
                now,
            )
        }
    }
}


/// Verify an inbound `IssuerCapability` offer at ingest time (the owner ->
/// delegate handshake over `/soma/issuer-offer/1`).
///
/// Closes the second gap from the fix report: previously nothing verified
/// `IssuerCapability.signed` at ingest at all, so a self-signed,
/// self-claimed-owner offer from any connectable peer was persisted as
/// `bot_status::ACTIVE` with zero verification.
///
/// The sender must be the peer claiming ownership (the only offer flow
/// this system implements is a direct owner -> delegate handshake — see
/// `backend/crates/peer/src/codec/issuer.rs`), that claim must agree with
/// any already-pinned trust anchor for the space, and the signature must
/// actually verify against the sender's authenticated public key (fetched
/// through `resolver`, never trusted from the payload itself).
///
/// Returns the (now pinned) anchor and the owner's verified public key on
/// success, so the caller can cache the key for later re-verification
/// (e.g. at auto/manual join-approval time, where the same key is needed
/// again).
pub async fn verify_inbound_issuer_capability(
    repo: &dyn MembershipRepository,
    resolver: &dyn PeerKeyResolver,
    from: &PeerId,
    capability: &IssuerCapability,
) -> SomaResult<(TrustAnchor, PublicKey)> {
    let space_id = capability
        .space_id
        .as_ref()
        .map(|s| s.value.as_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| Error::service("issuer capability missing space_id"))?;

    let claimed_owner: PeerId = capability
        .owner_peer_id
        .as_ref()
        .map(|p| p.value.as_str())
        .unwrap_or_default()
        .parse()
        .map_err(|_| Error::service("issuer capability owner peer id malformed"))?;

    if claimed_owner != *from {
        return Err(Error::service(
            "issuer capability sender is not the claimed owner",
        ));
    }

    let anchor = resolve_trust_anchor(repo, space_id, from).await?;
    if anchor.peer_id() != claimed_owner {
        return Err(Error::service(
            "issuer capability owner does not match this space's trusted owner",
        ));
    }

    let owner_pub = resolver
        .resolve(from)
        .await
        .ok_or_else(|| Error::service("issuer capability sender public key unavailable"))?;

    soma_common::verify_issuer_capability(capability, &owner_pub, SystemTime::now())?;

    pin_trust_anchor(repo, space_id, anchor).await?;
    Ok((anchor, owner_pub))
}

/// A [`PeerKeyResolver`] backed purely by the persisted `peer_public_keys`
/// table (no in-memory Identify cache — that lives in the daemon/peer
/// runtime layer, which this crate deliberately has no dependency on).
/// Used for the local auto/manual join-approval paths in
/// [`crate::issuer`] and [`crate::join_decider`], where the only trust
/// input available is whatever is already durably stored.
pub(crate) struct StoragePeerKeyResolver(
    std::sync::Arc<dyn soma_storage::peers::PeerPublicKeyRepository>,
);

impl StoragePeerKeyResolver {
    pub(crate) fn new(repos: &dyn soma_storage::RepositoryProvider) -> Self {
        Self(repos.peer_keys_repo())
    }

    pub(crate) fn from_repo(
        repo: std::sync::Arc<dyn soma_storage::peers::PeerPublicKeyRepository>,
    ) -> Self {
        Self(repo)
    }
}

#[async_trait]
impl PeerKeyResolver for StoragePeerKeyResolver {
    async fn resolve(&self, peer: &PeerId) -> Option<PublicKey> {
        self.0
            .get(&peer.to_string())
            .await
            .ok()
            .flatten()
            .and_then(|row| PublicKey::try_decode_protobuf(&row.public_key).ok())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{FakeMembershipRepo, FixedKeyResolver};
    use libp2p::identity::Keypair;
    use soma_proto_build::space::{self, SpaceRole};

    fn signed_issuer_cap(
        owner: &Keypair,
        delegate_peer: &PeerId,
        space_id: &str,
    ) -> IssuerCapability {
        let mut cap = IssuerCapability {
            space_id: Some(space::SpaceId {
                value: space_id.to_string(),
            }),
            issuer_peer_id: Some(space::PeerId {
                value: delegate_peer.to_string(),
            }),
            allowed_roles: vec![SpaceRole::Member as i32],
            default_permissions: Vec::new(),
            issued_at: None,
            expires_at: None,
            max_member_expires_at: None,
            max_issues_per_hour: 0,
            owner_peer_id: Some(space::PeerId {
                value: owner.public().to_peer_id().to_string(),
            }),
            signed: None,
        };
        soma_common::sign_issuer_capability(&mut cap, owner).expect("sign issuer capability");
        cap
    }

    #[tokio::test]
    async fn ingest_accepts_first_contact_direct_owner_offer() {
        let owner = Keypair::generate_ed25519();
        let owner_peer = owner.public().to_peer_id();
        let delegate = Keypair::generate_ed25519().public().to_peer_id();
        let cap = signed_issuer_cap(&owner, &delegate, "space-1");

        let repo = FakeMembershipRepo::default();
        let resolver = FixedKeyResolver(vec![(owner_peer, owner.public())]);

        let (anchor, _) = verify_inbound_issuer_capability(&repo, &resolver, &owner_peer, &cap)
            .await
            .expect("legitimate first-contact offer should verify");
        assert_eq!(anchor.peer_id(), owner_peer);

        let pinned = repo
            .get_space("space-1")
            .await
            .expect("get_space")
            .and_then(|s| s.owner_peer_id);
        assert_eq!(pinned, Some(owner_peer.to_string()));
    }

    /// Mandatory regression test: an `IssuerCapability` with a valid
    /// structure but an ABSENT signature must be rejected at the ingest
    /// consumption point.
    #[tokio::test]
    async fn ingest_rejects_unsigned_capability() {
        let owner = Keypair::generate_ed25519();
        let owner_peer = owner.public().to_peer_id();
        let delegate = Keypair::generate_ed25519().public().to_peer_id();
        // Build the capability WITHOUT calling sign_issuer_capability.
        let cap = IssuerCapability {
            space_id: Some(space::SpaceId {
                value: "space-1".into(),
            }),
            issuer_peer_id: Some(space::PeerId {
                value: delegate.to_string(),
            }),
            allowed_roles: vec![SpaceRole::Member as i32],
            default_permissions: Vec::new(),
            issued_at: None,
            expires_at: None,
            max_member_expires_at: None,
            max_issues_per_hour: 0,
            owner_peer_id: Some(space::PeerId {
                value: owner_peer.to_string(),
            }),
            signed: None,
        };

        let repo = FakeMembershipRepo::default();
        let resolver = FixedKeyResolver(vec![(owner_peer, owner.public())]);

        let err = verify_inbound_issuer_capability(&repo, &resolver, &owner_peer, &cap)
            .await
            .expect_err("unsigned capability must be rejected");
        assert!(
            format!("{err}").contains("missing signature"),
            "unexpected error: {err}"
        );
        assert!(
            repo.get_space("space-1")
                .await
                .expect("get_space")
                .is_none(),
            "an unsigned offer must not pin a trust anchor"
        );
    }

    /// Mandatory regression test: an `IssuerCapability` with a valid
    /// structure but an INVALID signature (tampered payload) must be
    /// rejected at the ingest consumption point.
    #[tokio::test]
    async fn ingest_rejects_tampered_capability() {
        let owner = Keypair::generate_ed25519();
        let owner_peer = owner.public().to_peer_id();
        let delegate = Keypair::generate_ed25519().public().to_peer_id();
        let mut cap = signed_issuer_cap(&owner, &delegate, "space-1");
        // Tamper post-signature: allow OWNER role after the owner only
        // ever signed off on MEMBER.
        cap.allowed_roles = vec![SpaceRole::Owner as i32];

        let repo = FakeMembershipRepo::default();
        let resolver = FixedKeyResolver(vec![(owner_peer, owner.public())]);

        let err = verify_inbound_issuer_capability(&repo, &resolver, &owner_peer, &cap)
            .await
            .expect_err("tampered capability must be rejected");
        assert!(
            format!("{err}").contains("payload mismatch"),
            "unexpected error: {err}"
        );
    }

    #[tokio::test]
    async fn ingest_rejects_claim_inconsistent_with_pinned_owner() {
        let real_owner = Keypair::generate_ed25519();
        let real_owner_peer = real_owner.public().to_peer_id();
        let attacker = Keypair::generate_ed25519();
        let attacker_peer = attacker.public().to_peer_id();
        let delegate = Keypair::generate_ed25519().public().to_peer_id();

        let repo = FakeMembershipRepo::default();
        // Pin the real owner first, as if a legitimate offer had already
        // been ingested.
        repo.upsert_space(&Space {
            space_id: "space-1".into(),
            display_name: None,
            owner_peer_id: Some(real_owner_peer.to_string()),
            created_at: 0,
        })
        .await
        .expect("pin owner");

        // Attacker sends a self-signed, self-claimed-owner offer for the
        // SAME space.
        let forged = signed_issuer_cap(&attacker, &delegate, "space-1");
        let resolver = FixedKeyResolver(vec![
            (real_owner_peer, real_owner.public()),
            (attacker_peer, attacker.public()),
        ]);

        let err = verify_inbound_issuer_capability(&repo, &resolver, &attacker_peer, &forged)
            .await
            .expect_err("offer from a non-owner must be rejected");
        assert!(
            format!("{err}").contains("does not match this space's trusted owner"),
            "unexpected error: {err}"
        );
    }
}
