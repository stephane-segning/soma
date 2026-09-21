//! Space invite links: create, offline-verify, redeem, decider-side
//! auto-approval, and revocation.
//!
//! # Trust model
//!
//! An invite is owner-signed (see [`soma_common::sign_invite_state`]),
//! which makes it a strictly better trust anchor than a peer id pasted
//! out of band: the invitee verifies the issuer's signature over the
//! exact invite terms (space, role, expiry, bootstrap addresses) before
//! ever dialling anyone (see [`inspect_invite_link`]), and on redemption
//! the verified issuer becomes the [`crate::trust::TrustAnchor`] pinned
//! for the space -- never a peer id trusted merely because it happened to
//! answer a dial. See `soma_common::verify_invite_state`'s doc comment
//! for exactly what "verified" does and does not prove, and
//! `docs/src/space-authorization-model.md` for the wider picture.
//!
//! # Replay protection: single-use by default
//!
//! An invite is **single-use unless explicitly created as multi-use**.
//! Single-use is the secure default -- a link that leaks (forwarded,
//! posted somewhere semi-public) can only ever seat one member, matching
//! what most invitees expect from "an invite" rather than "a standing
//! door code". Multi-use is opt-in for the "classroom/team" case where
//! the owner wants one link many people redeem; its weaker replay
//! properties are mitigated by [`revoke_invite`] being available at any
//! time. Enforcement is [`soma_storage::invites::InviteRepository::try_consume`]'s
//! single guarded `UPDATE`, so replay protection holds even under
//! concurrent redemption attempts -- see that trait method's doc comment.
//!
//! # What decider-side auto-approval trusts
//!
//! [`try_auto_approve_via_invite`] mirrors
//! `join_decider::storage::self_issued_delegate_role`'s exact spirit:
//! auto-approval traces ONLY to a row this decider itself inserted via
//! [`create_invite`] (looked up by `(space_id, invite_nonce)`, both of
//! which come off the wire but only ever resolve to a hit if they match
//! something this process itself created and stored). The wire-carried
//! `InviteProof.state` is never trusted for authorization -- only its
//! `invite_nonce` is used, purely as a lookup key.
//!
//! Not yet implemented: cryptographic verification of the *requester's*
//! signature over `InviteProof` (binding "this exact JoinRequest" to the
//! peer id it claims to be from). The requester DOES sign it (see
//! [`soma_common::build_invite_proof`], called from [`redeem_invite`]),
//! matching the proto's documented intent and keeping the wire format
//! forward-compatible -- but verifying it server-side would need the
//! requester's public key, which (per this crate's established
//! `PeerKeyResolver` contract -- see `trust.rs`) may only come from a
//! prior Identify exchange, and nothing in this codebase guarantees
//! Identify has completed before a `JoinRequest` on a freshly-dialled
//! connection arrives. Auto-approval therefore stays on "local ground
//! truth only" grounds identical to `self_issued_delegate_role`, and does
//! not additionally bind the requester's transport identity. Tracked as
//! follow-up hardening, not silently assumed to be covered.

use std::time::SystemTime;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use libp2p::{PeerId, identity::Keypair};
use prost::Message;
use prost_types::Timestamp;
use soma_core::{Error, SomaResult};
use soma_proto_build::space::{self, InviteState, JoinRequest, SpaceRole};
use soma_storage::RepositoryProvider;
use soma_storage::invites::Invite as StoredInvite;

use crate::{
    roles::{parse_role_str, role_to_str},
    time::epoch_seconds,
    trust::{pin_trust_anchor, resolve_trust_anchor},
};

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/// One issued invite, in the shape both [`create_invite`] and
/// [`list_invites`] return -- everything an owner-facing "Invites" UI
/// needs to render a row and share/revoke it.
#[derive(Debug, Clone)]
pub struct InviteSummary {
    pub space_id: String,
    /// Base64url (no padding) of the invite's random nonce -- the opaque
    /// id [`revoke_invite`] takes.
    pub id: String,
    /// The full `soma://invite/...` link.
    pub link: String,
    pub issuer_peer_id: String,
    pub role: SpaceRole,
    /// Unix-seconds. `None` means "never expires".
    pub expires_at: Option<i64>,
    pub label: Option<String>,
    pub multi_use: bool,
    pub created_at: i64,
    pub revoked_at: Option<i64>,
    pub redeemed_count: i64,
}

/// Create and persist a signed invite for `space_id`, returning its link.
///
/// # Authorization
/// `owner_peer_id` (the caller's own identity) must be the space's
/// pinned owner. Fails closed: a space with no pinned owner yet (e.g.
/// this device has never established one) cannot have invites created
/// for it via this path.
///
/// # Parameters
/// - `ttl_secs`: `None` means the invite never expires. `Some(secs)` sets
///   `expires_at = now + secs`.
/// - `bootstrap_multiaddrs`: this peer's own reachable listen addresses
///   (the same set `DaemonHandle::status` reports), embedded so the
///   invitee's client has somewhere to dial without a separate discovery
///   step.
/// - `multi_use`: see the module doc comment's "Replay protection"
///   section. `false` (single-use) is the recommended default.
#[expect(
    clippy::too_many_arguments,
    reason = "mirrors the existing shape of issue_issuer_capability_to_storage in issuer.rs \
              (same crate, same rationale): a request-context struct would be a worthwhile \
              follow-up but is unrelated to this change"
)]
pub async fn create_invite(
    repos: &dyn RepositoryProvider,
    signer: &Keypair,
    owner_peer_id: &PeerId,
    space_id: &str,
    default_role: SpaceRole,
    ttl_secs: Option<i64>,
    bootstrap_multiaddrs: Vec<String>,
    space_label: String,
    multi_use: bool,
) -> SomaResult<InviteSummary> {
    let membership_repo = repos.membership_repo();
    let space = membership_repo
        .get_space(space_id)
        .await?
        .ok_or_else(|| Error::service("space not found"))?;
    let owns_space = space
        .owner_peer_id
        .as_ref()
        .map(|owner| owner == &owner_peer_id.to_string())
        .unwrap_or(false);
    if !owns_space {
        return Err(Error::service(
            "only the space owner may create invites for this space",
        ));
    }

    let now = SystemTime::now();
    let now_secs = epoch_seconds(now);
    let expires_at_secs = ttl_secs.map(|ttl| now_secs.saturating_add(ttl));

    let nonce = random_nonce();
    let mut state = InviteState {
        space_id: Some(space::SpaceId {
            value: space_id.to_string(),
        }),
        default_role: default_role as i32,
        expires_at: expires_at_secs.map(|secs| Timestamp {
            seconds: secs,
            nanos: 0,
        }),
        bootstrap_multiaddrs,
        invite_nonce: nonce.clone(),
        space_label,
        signed: None,
    };
    soma_common::sign_invite_state(&mut state, signer)?;
    let link = soma_common::encode_invite_link(&state)?;

    let id = encode_nonce_id(&nonce);
    let label = (!state.space_label.is_empty()).then(|| state.space_label.clone());
    let stored = StoredInvite {
        space_id: space_id.to_string(),
        invite_nonce: id.clone(),
        issuer_peer_id: owner_peer_id.to_string(),
        default_role: role_to_str(default_role).to_string(),
        expires_at: expires_at_secs,
        label: label.clone(),
        multi_use,
        created_at: now_secs,
        revoked_at: None,
        redeemed_count: 0,
        state: state.encode_to_vec(),
    };
    repos.invite_repo().insert(&stored).await?;

    Ok(InviteSummary {
        space_id: space_id.to_string(),
        id,
        link,
        issuer_peer_id: owner_peer_id.to_string(),
        role: default_role,
        expires_at: expires_at_secs,
        label,
        multi_use,
        created_at: now_secs,
        revoked_at: None,
        redeemed_count: 0,
    })
}

/// List every invite ever issued for `space_id`, newest first (revoked
/// and expired included -- see
/// [`soma_storage::invites::InviteRepository::list_by_space`]).
pub async fn list_invites(
    repos: &dyn RepositoryProvider,
    space_id: &str,
) -> SomaResult<Vec<InviteSummary>> {
    let rows = repos.invite_repo().list_by_space(space_id).await?;
    Ok(rows.iter().filter_map(row_to_summary).collect())
}

/// Revoke an invite so it can no longer be redeemed.
///
/// # Authorization
/// `caller_peer_id` must be the space's pinned owner. Returns `Ok(true)`
/// only if a not-already-revoked row was found and revoked.
pub async fn revoke_invite(
    repos: &dyn RepositoryProvider,
    caller_peer_id: &PeerId,
    space_id: &str,
    id: &str,
) -> SomaResult<bool> {
    let owner_peer_id = repos
        .membership_repo()
        .get_space(space_id)
        .await?
        .and_then(|space| space.owner_peer_id);
    if owner_peer_id.as_deref() != Some(&caller_peer_id.to_string()) {
        return Err(Error::service(
            "only the space owner may revoke invites for this space",
        ));
    }

    let now_secs = epoch_seconds(SystemTime::now());
    let rows = repos.invite_repo().revoke(space_id, id, now_secs).await?;
    Ok(rows > 0)
}

fn row_to_summary(row: &StoredInvite) -> Option<InviteSummary> {
    Some(InviteSummary {
        space_id: row.space_id.clone(),
        id: row.invite_nonce.clone(),
        link: {
            let state = InviteState::decode(row.state.as_slice()).ok()?;
            soma_common::encode_invite_link(&state).ok()?
        },
        issuer_peer_id: row.issuer_peer_id.clone(),
        role: parse_role_str(&row.default_role).unwrap_or(SpaceRole::Member),
        expires_at: row.expires_at,
        label: row.label.clone(),
        multi_use: row.multi_use,
        created_at: row.created_at,
        revoked_at: row.revoked_at,
        redeemed_count: row.redeemed_count,
    })
}

// ---------------------------------------------------------------------------
// Inspect (offline, invitee side)
// ---------------------------------------------------------------------------

/// Why an inspected invite link is or isn't usable. Never conflated with
/// a bare `bool` -- see the module's callers, which all need to render a
/// specific reason.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InviteValidity {
    Valid,
    /// Decoded, but the signature doesn't verify -- forged, corrupted in
    /// transit, or (harmlessly) hand-edited.
    InvalidSignature,
    /// Decoded and signature-valid, but `expires_at` is in the past.
    Expired,
    /// Not a well-formed `soma://invite/...` link at all.
    Malformed,
}

/// Everything the invitee-facing confirmation screen needs, decoded and
/// verified with **zero network access** -- see [`inspect_invite_link`].
#[derive(Debug, Clone)]
pub struct InviteInspection {
    pub validity: InviteValidity,
    pub space_id: Option<String>,
    pub space_label: Option<String>,
    pub role: Option<SpaceRole>,
    /// The verified issuer peer id when `validity == Valid`; the
    /// UNVERIFIED claimed signer otherwise (present only for UI purposes,
    /// e.g. "claims to be from X" on an invalid-signature screen --
    /// **never** use this field for any trust decision unless `validity
    /// == Valid`).
    pub issuer_peer_id: Option<String>,
    /// Unix-seconds. `None` means "never expires" (only meaningful when
    /// `validity != Malformed`).
    pub expires_at: Option<i64>,
    pub bootstrap_multiaddrs: Vec<String>,
}

impl InviteInspection {
    fn malformed() -> Self {
        Self {
            validity: InviteValidity::Malformed,
            space_id: None,
            space_label: None,
            role: None,
            issuer_peer_id: None,
            expires_at: None,
            bootstrap_multiaddrs: Vec::new(),
        }
    }
}

/// Decode and verify a `soma://invite/...` link with **zero network
/// access** -- pure function of the link string, so the invitee's UI can
/// show a trustworthy confirmation screen before dialling anyone. Never
/// returns an `Err`: every failure mode is a typed [`InviteValidity`]
/// variant on the returned [`InviteInspection`] instead, since a
/// malformed/forged/expired link is an ordinary, expected outcome for
/// this function, not an exceptional one.
pub fn inspect_invite_link(link: &str) -> InviteInspection {
    let Ok(state) = soma_common::decode_invite_link(link) else {
        return InviteInspection::malformed();
    };

    let space_id = state
        .space_id
        .as_ref()
        .map(|s| s.value.clone())
        .filter(|s| !s.is_empty());
    let space_label = (!state.space_label.is_empty()).then(|| state.space_label.clone());
    let role = SpaceRole::try_from(state.default_role).ok();
    let expires_at = state.expires_at.as_ref().map(|ts| ts.seconds);
    let bootstrap_multiaddrs = state.bootstrap_multiaddrs.clone();
    let claimed_issuer = state
        .signed
        .as_ref()
        .and_then(|s| s.signer_peer_id.as_ref())
        .map(|p| p.value.clone());

    let Ok(owner_pub) = soma_common::verify_invite_signature(&state) else {
        return InviteInspection {
            validity: InviteValidity::InvalidSignature,
            space_id,
            space_label,
            role,
            issuer_peer_id: claimed_issuer,
            expires_at,
            bootstrap_multiaddrs,
        };
    };

    let now_secs = epoch_seconds(SystemTime::now());
    let expired = expires_at.map(|exp| exp <= now_secs).unwrap_or(false);

    InviteInspection {
        validity: if expired {
            InviteValidity::Expired
        } else {
            InviteValidity::Valid
        },
        space_id,
        space_label,
        role,
        issuer_peer_id: Some(owner_pub.to_peer_id().to_string()),
        expires_at,
        bootstrap_multiaddrs,
    }
}

// ---------------------------------------------------------------------------
// Redeem (invitee side)
// ---------------------------------------------------------------------------

/// Everything [`crate`]'s caller (the daemon handle) needs to actually
/// dial the issuer and send the join request [`redeem_invite`] prepared.
#[derive(Debug, Clone)]
pub struct InviteRedemption {
    pub space_id: String,
    pub issuer_peer_id: PeerId,
    pub bootstrap_multiaddrs: Vec<String>,
    pub join_request: JoinRequest,
}

/// Verify `link` (fail closed -- see [`soma_common::verify_invite_state`]),
/// pin the verified issuer as this space's [`crate::trust::TrustAnchor`],
/// cache the issuer's public key, and build a ready-to-send `JoinRequest`
/// carrying a fresh [`soma_common::build_invite_proof`] proof.
///
/// Does **not** dial or send anything over the network -- this crate has
/// no transport dependency of its own (see `soma-peer`'s `JoinDecider`
/// for the analogous split). The caller sends `join_request` to
/// `issuer_peer_id` at `bootstrap_multiaddrs`, exactly like
/// `DaemonHandle::join_space`'s existing tail.
pub async fn redeem_invite(
    repos: &dyn RepositoryProvider,
    requester: &Keypair,
    link: &str,
    display_name: String,
    device_name: String,
) -> SomaResult<InviteRedemption> {
    let state = soma_common::decode_invite_link(link)
        .map_err(|_| Error::service("malformed invite link"))?;
    // Fail closed: forged signature, tampered payload, or expired all
    // reject here, before any trust anchor is touched or anything is
    // dialled -- see verify_invite_state's doc comment for exactly what
    // this proves.
    let owner_pub = soma_common::verify_invite_state(&state, SystemTime::now())?;
    let issuer_peer_id = owner_pub.to_peer_id();

    let space_id = state
        .space_id
        .as_ref()
        .map(|s| s.value.clone())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| Error::service("invite missing space_id"))?;

    let membership_repo = repos.membership_repo();
    // Pin the trust anchor from the VERIFIED invite issuer -- see the
    // module doc comment's "Trust model" section. If this space already
    // has a DIFFERENT pinned owner, this invite is inconsistent with
    // already-established ground truth and must be rejected, not
    // silently ignored in favour of the old anchor.
    let anchor = resolve_trust_anchor(membership_repo.as_ref(), &space_id, &issuer_peer_id).await?;
    if anchor.peer_id() != issuer_peer_id {
        return Err(Error::service(
            "invite issuer does not match this space's already-established trust anchor",
        ));
    }
    pin_trust_anchor(membership_repo.as_ref(), &space_id, anchor).await?;

    // Cache the verified owner key so a later inbound JoinDecision can be
    // signature-checked without waiting on a separate Identify exchange
    // -- the invite signature already proved this key controls
    // `issuer_peer_id`. Uses the same `peer_public_keys` table Identify
    // itself writes to (see `identify_store.rs`), so
    // `StoragePeerKeyResolver` picks it up transparently.
    repos
        .peer_keys_repo()
        .upsert(
            &issuer_peer_id.to_string(),
            &owner_pub.encode_protobuf(),
            epoch_seconds(SystemTime::now()),
        )
        .await?;

    let invite_proof = soma_common::build_invite_proof(&state, requester)?;
    // The invite's own `default_role` is what gets requested -- a
    // requester-declared role would be meaningless anyway, since
    // `try_auto_approve_via_invite` always grants the STORED invite's
    // role regardless of what's asked for.
    let role = SpaceRole::try_from(state.default_role).unwrap_or(SpaceRole::Member);

    let join_request = JoinRequest {
        space_id: Some(space::SpaceId {
            value: space_id.clone(),
        }),
        peer_id: Some(space::PeerId {
            value: requester.public().to_peer_id().to_string(),
        }),
        display_name,
        device_name,
        requester_code: String::new(),
        requested_role: role as i32,
        invite_proof: Some(invite_proof),
        created_at: Some(Timestamp::from(SystemTime::now())),
    };

    Ok(InviteRedemption {
        space_id,
        issuer_peer_id,
        bootstrap_multiaddrs: state.bootstrap_multiaddrs,
        join_request,
    })
}

// ---------------------------------------------------------------------------
// Decider-side auto-approval
// ---------------------------------------------------------------------------

/// Attempt to auto-approve `request` via an invite this decider itself
/// issued. Returns `None` when there is no usable invite-based grounds
/// for auto-approval -- falls through to the existing manual/delegation
/// paths in `join_decider::storage::decide` -- and `Some(role)` when
/// auto-approval is authorised, at the invite's OWN stored role
/// (`request.requested_role` is never trusted for this, matching
/// `self_issued_delegate_role`'s exact pattern of ignoring the
/// self-declared role).
///
/// On success, this call has ALREADY atomically consumed the invite's
/// single use (see
/// [`soma_storage::invites::InviteRepository::try_consume`]) -- callers
/// must not call this twice for the same request or treat a `None`
/// result as retryable without checking why.
pub(crate) async fn try_auto_approve_via_invite(
    invite_repo: &dyn soma_storage::invites::InviteRepository,
    space_id: &str,
    request: &JoinRequest,
    now: SystemTime,
) -> Option<SpaceRole> {
    let proof = request.invite_proof.as_ref()?;
    let wire_state = proof.state.as_ref()?;
    if wire_state.invite_nonce.is_empty() {
        return None;
    }
    let id = encode_nonce_id(&wire_state.invite_nonce);

    // Local ground truth only: a hit here can only ever exist because
    // THIS decider's own `create_invite` call inserted it -- there is no
    // network-reachable writer of the `invites` table. See the module
    // doc comment's "What decider-side auto-approval trusts" section.
    let stored = invite_repo.get(space_id, &id).await.ok()??;

    // Redundant with the composite-key lookup above (an invite issued
    // for a different space_id is never found under THIS space_id at
    // all), kept as an explicit, intent-revealing assertion -- see the
    // required "space A invite can't redeem against space B" test.
    if stored.space_id != space_id {
        return None;
    }

    let now_secs = epoch_seconds(now);
    let not_revoked = stored.revoked_at.is_none();
    let not_expired = stored.expires_at.map(|exp| exp > now_secs).unwrap_or(true);
    if !(not_revoked && not_expired) {
        return None;
    }

    let consumed = invite_repo
        .try_consume(space_id, &id, now_secs)
        .await
        .ok()?;
    if !consumed {
        return None;
    }

    parse_role_str(&stored.default_role)
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

fn random_nonce() -> Vec<u8> {
    // Two u64s rather than a byte-array RNG call -- matches the exact
    // `rand::random::<u64>()` pattern already used for id generation
    // elsewhere in this crate (`join_decider::approval`,
    // `join_decider::pending`), rather than depending on a `rand` 0.9
    // array-fill API this crate hasn't otherwise exercised.
    let mut bytes = [0u8; 16];
    bytes[..8].copy_from_slice(&rand::random::<u64>().to_be_bytes());
    bytes[8..].copy_from_slice(&rand::random::<u64>().to_be_bytes());
    bytes.to_vec()
}

fn encode_nonce_id(nonce: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(nonce)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{FakeInviteRepo, FakeRepositoryProvider};
    use soma_proto_build::space::{PeerId as ProtoPeerId, SpaceId as ProtoSpaceId};
    use soma_storage::invites::InviteRepository as _;
    use soma_storage::membership::MembershipRepository as _;
    use std::time::Duration;

    fn keypair() -> Keypair {
        Keypair::generate_ed25519()
    }

    async fn seed_owned_space(provider: &FakeRepositoryProvider, space_id: &str, owner: &PeerId) {
        provider
            .membership
            .upsert_space(&soma_storage::membership::Space {
                space_id: space_id.to_string(),
                display_name: None,
                owner_peer_id: Some(owner.to_string()),
                created_at: 0,
            })
            .await
            .expect("seed space");
    }

    // -- create / inspect / redeem round trip -----------------------------

    #[tokio::test]
    async fn create_then_inspect_reports_valid_with_every_field() {
        let owner = keypair();
        let owner_peer = owner.public().to_peer_id();
        let provider = FakeRepositoryProvider::default();
        seed_owned_space(&provider, "space-1", &owner_peer).await;

        let summary = create_invite(
            &provider,
            &owner,
            &owner_peer,
            "space-1",
            SpaceRole::Editor,
            Some(3600),
            vec!["/ip4/127.0.0.1/tcp/14005".into()],
            "Form 4 Maths".into(),
            false,
        )
        .await
        .expect("create invite");
        assert!(summary.link.starts_with("soma://invite/"));

        let inspection = inspect_invite_link(&summary.link);
        assert_eq!(inspection.validity, InviteValidity::Valid);
        assert_eq!(inspection.space_id.as_deref(), Some("space-1"));
        assert_eq!(inspection.space_label.as_deref(), Some("Form 4 Maths"));
        assert_eq!(inspection.role, Some(SpaceRole::Editor));
        assert_eq!(
            inspection.issuer_peer_id.as_deref(),
            Some(owner_peer.to_string()).as_deref()
        );
        assert!(inspection.expires_at.is_some());
        assert_eq!(
            inspection.bootstrap_multiaddrs,
            vec!["/ip4/127.0.0.1/tcp/14005".to_string()]
        );
    }

    /// Mandatory regression test: an absent signature is rejected.
    #[test]
    fn inspect_rejects_an_unsigned_link_as_malformed_or_invalid() {
        // An InviteState can't even become a link without being signed
        // (`encode_invite_link` refuses) -- so the only way to observe
        // "no signature" through the link surface is a hand-crafted
        // payload. We simulate that by verifying the unsigned state
        // directly against the lower-level function instead, and
        // separately prove `encode_invite_link` itself refuses.
        let state = InviteState {
            space_id: Some(ProtoSpaceId {
                value: "space-1".into(),
            }),
            default_role: SpaceRole::Member as i32,
            expires_at: None,
            bootstrap_multiaddrs: Vec::new(),
            invite_nonce: vec![1, 2, 3],
            space_label: String::new(),
            signed: None,
        };
        let err = soma_common::encode_invite_link(&state).unwrap_err();
        assert!(format!("{err}").contains("unsigned"));
        let err = soma_common::verify_invite_signature(&state).unwrap_err();
        assert!(format!("{err}").contains("missing signature"));
    }

    /// Mandatory regression test: a forged signature (tampered
    /// post-signature, or simply a payload some other keypair signed) is
    /// rejected by both the offline inspector and `redeem_invite`.
    #[tokio::test]
    async fn forged_signature_is_rejected_by_inspect_and_redeem() {
        let owner = keypair();
        let owner_peer = owner.public().to_peer_id();
        let provider = FakeRepositoryProvider::default();
        seed_owned_space(&provider, "space-1", &owner_peer).await;

        let summary = create_invite(
            &provider,
            &owner,
            &owner_peer,
            "space-1",
            SpaceRole::Member,
            None,
            Vec::new(),
            String::new(),
            false,
        )
        .await
        .expect("create invite");

        // Tamper post-signature: bump the role the link claims to grant.
        let mut state = soma_common::decode_invite_link(&summary.link).expect("decode");
        state.default_role = SpaceRole::Owner as i32;
        // Re-encode WITHOUT re-signing -- exactly what an attacker editing
        // the link's payload would produce.
        let tampered_link = soma_common::encode_invite_link(&state).expect("encode tampered");

        let inspection = inspect_invite_link(&tampered_link);
        assert_eq!(inspection.validity, InviteValidity::InvalidSignature);

        let requester = keypair();
        let err = redeem_invite(
            &provider,
            &requester,
            &tampered_link,
            "Ada".into(),
            "Laptop".into(),
        )
        .await
        .expect_err("tampered invite must not redeem");
        assert!(
            format!("{err}").contains("signature") || format!("{err}").contains("payload"),
            "unexpected error: {err}"
        );
    }

    /// Mandatory regression test: an expired invite is rejected by both
    /// the offline inspector and `redeem_invite`.
    #[tokio::test]
    async fn expired_invite_is_rejected_by_inspect_and_redeem() {
        let owner = keypair();
        let owner_peer = owner.public().to_peer_id();
        let provider = FakeRepositoryProvider::default();
        seed_owned_space(&provider, "space-1", &owner_peer).await;

        // ttl_secs = 0 (via saturating_add) puts expires_at at "now" --
        // sleep past it so the check is unambiguous rather than racing
        // the clock.
        let summary = create_invite(
            &provider,
            &owner,
            &owner_peer,
            "space-1",
            SpaceRole::Member,
            Some(0),
            Vec::new(),
            String::new(),
            false,
        )
        .await
        .expect("create invite");
        tokio::time::sleep(Duration::from_millis(1100)).await;

        let inspection = inspect_invite_link(&summary.link);
        assert_eq!(inspection.validity, InviteValidity::Expired);

        let requester = keypair();
        let err = redeem_invite(
            &provider,
            &requester,
            &summary.link,
            "Ada".into(),
            "Laptop".into(),
        )
        .await
        .expect_err("expired invite must not redeem");
        assert!(
            format!("{err}").contains("expired"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn inspect_rejects_a_malformed_link() {
        let inspection = inspect_invite_link("not-a-link-at-all");
        assert_eq!(inspection.validity, InviteValidity::Malformed);
        assert!(inspection.space_id.is_none());
    }

    /// `redeem_invite` pins the verified issuer as the space's trust
    /// anchor -- the core "closes the TOFU gap" property.
    #[tokio::test]
    async fn redeem_pins_the_verified_issuer_as_trust_anchor() {
        let owner = keypair();
        let owner_peer = owner.public().to_peer_id();
        let provider = FakeRepositoryProvider::default();
        seed_owned_space(&provider, "space-1", &owner_peer).await;

        let summary = create_invite(
            &provider,
            &owner,
            &owner_peer,
            "space-1",
            SpaceRole::Member,
            None,
            vec!["/ip4/127.0.0.1/tcp/14005".into()],
            String::new(),
            false,
        )
        .await
        .expect("create invite");

        // Fresh device, no prior relationship to this space at all.
        let fresh_provider = FakeRepositoryProvider::default();
        let requester = keypair();
        let redemption = redeem_invite(
            &fresh_provider,
            &requester,
            &summary.link,
            "Ada".into(),
            "Laptop".into(),
        )
        .await
        .expect("redeem invite");

        assert_eq!(redemption.space_id, "space-1");
        assert_eq!(redemption.issuer_peer_id, owner_peer);
        assert_eq!(
            redemption.bootstrap_multiaddrs,
            vec!["/ip4/127.0.0.1/tcp/14005".to_string()]
        );
        assert_eq!(
            redemption.join_request.requested_role,
            SpaceRole::Member as i32
        );
        assert!(redemption.join_request.invite_proof.is_some());

        let pinned = fresh_provider
            .membership
            .get_space("space-1")
            .await
            .expect("get_space")
            .and_then(|s| s.owner_peer_id);
        assert_eq!(pinned, Some(owner_peer.to_string()));
    }

    /// A validly-signed invite whose issuer disagrees with this space's
    /// ALREADY-pinned trust anchor must be rejected outright -- the
    /// pinned anchor always wins, exactly like `resolve_trust_anchor`'s
    /// contract for every other first-contact path in this crate (see
    /// `trust.rs::tests::ingest_rejects_claim_inconsistent_with_pinned_owner`
    /// for the analogous case on the issuer-capability path). Otherwise a
    /// second, unrelated keypair could mint its own self-consistent
    /// invite for a `space_id` string the device already associates with
    /// a different, trusted owner, and silently take over that trust
    /// relationship.
    #[tokio::test]
    async fn redeem_rejects_an_invite_whose_issuer_disagrees_with_the_pinned_anchor() {
        let real_owner = keypair();
        let real_owner_peer = real_owner.public().to_peer_id();
        let attacker = keypair();
        let attacker_peer = attacker.public().to_peer_id();

        // This device already has a trusted relationship with space-1
        // under the REAL owner.
        let provider = FakeRepositoryProvider::default();
        provider
            .membership
            .upsert_space(&soma_storage::membership::Space {
                space_id: "space-1".into(),
                display_name: None,
                owner_peer_id: Some(real_owner_peer.to_string()),
                created_at: 0,
            })
            .await
            .expect("pin real owner");

        // The attacker independently owns "space-1" as far as ITS OWN
        // process is concerned and mints a perfectly validly-signed
        // invite for it under its own key.
        let attacker_provider = FakeRepositoryProvider::default();
        seed_owned_space(&attacker_provider, "space-1", &attacker_peer).await;
        let forged_looking_but_validly_signed_invite = create_invite(
            &attacker_provider,
            &attacker,
            &attacker_peer,
            "space-1",
            SpaceRole::Owner,
            None,
            Vec::new(),
            String::new(),
            false,
        )
        .await
        .expect("attacker can validly sign their own invite");

        // Sanity: the link is perfectly valid on its own terms.
        assert_eq!(
            inspect_invite_link(&forged_looking_but_validly_signed_invite.link).validity,
            InviteValidity::Valid
        );

        let requester = keypair();
        let err = redeem_invite(
            &provider,
            &requester,
            &forged_looking_but_validly_signed_invite.link,
            "Ada".into(),
            "Laptop".into(),
        )
        .await
        .expect_err("an invite from a non-pinned issuer must be rejected");
        assert!(
            format!("{err}")
                .contains("does not match this space's already-established trust anchor"),
            "unexpected error: {err}"
        );

        // The pinned anchor must be completely unchanged.
        let pinned = provider
            .membership
            .get_space("space-1")
            .await
            .expect("get_space")
            .and_then(|s| s.owner_peer_id);
        assert_eq!(pinned, Some(real_owner_peer.to_string()));
        assert_ne!(pinned, Some(attacker_peer.to_string()));
    }

    // -- decider-side auto-approval / replay protection --------------------

    fn join_request_with_proof(
        space_id: &str,
        subject: &PeerId,
        nonce: &[u8],
        requested_role: SpaceRole,
    ) -> JoinRequest {
        JoinRequest {
            space_id: Some(ProtoSpaceId {
                value: space_id.to_string(),
            }),
            peer_id: Some(ProtoPeerId {
                value: subject.to_string(),
            }),
            display_name: "Ada".into(),
            device_name: "Laptop".into(),
            requester_code: String::new(),
            requested_role: requested_role as i32,
            invite_proof: Some(space::InviteProof {
                state: Some(InviteState {
                    space_id: Some(ProtoSpaceId {
                        value: space_id.to_string(),
                    }),
                    default_role: SpaceRole::Member as i32,
                    expires_at: None,
                    bootstrap_multiaddrs: Vec::new(),
                    invite_nonce: nonce.to_vec(),
                    space_label: String::new(),
                    signed: None,
                }),
                ts: Some(Timestamp::from(SystemTime::now())),
                nonce: vec![9, 9, 9],
                proof: vec![1, 2, 3],
                proof_type: "libp2p-ecdsa-cbor".into(),
            }),
            created_at: Some(Timestamp::from(SystemTime::now())),
        }
    }

    fn seed_invite(
        repo: &FakeInviteRepo,
        space_id: &str,
        id: &str,
        role: SpaceRole,
    ) -> StoredInvite {
        let invite = StoredInvite {
            space_id: space_id.to_string(),
            invite_nonce: id.to_string(),
            issuer_peer_id: PeerId::random().to_string(),
            default_role: role_to_str(role).to_string(),
            expires_at: None,
            label: None,
            multi_use: false,
            created_at: 0,
            revoked_at: None,
            redeemed_count: 0,
            state: Vec::new(),
        };
        repo.seed(invite.clone());
        invite
    }

    /// A valid invite auto-approves at the stated role and no higher --
    /// even when the requester asks for `Owner`.
    #[tokio::test]
    async fn valid_invite_auto_approves_at_stated_role_and_no_higher() {
        let repo = FakeInviteRepo::default();
        let nonce = b"nonce-1".to_vec();
        let id = encode_nonce_id(&nonce);
        seed_invite(&repo, "space-1", &id, SpaceRole::Editor);

        let subject = PeerId::random();
        let request = join_request_with_proof("space-1", &subject, &nonce, SpaceRole::Owner);

        let role = try_auto_approve_via_invite(&repo, "space-1", &request, SystemTime::now())
            .await
            .expect("valid invite should auto-approve");
        assert_eq!(
            role,
            SpaceRole::Editor,
            "granted role must be the invite's own default_role, never the requester's ask"
        );
    }

    /// Mandatory regression test: a consumed (single-use) nonce cannot be
    /// replayed.
    #[tokio::test]
    async fn consumed_single_use_nonce_cannot_be_replayed() {
        let repo = FakeInviteRepo::default();
        let nonce = b"nonce-1".to_vec();
        let id = encode_nonce_id(&nonce);
        seed_invite(&repo, "space-1", &id, SpaceRole::Member);

        let subject = PeerId::random();
        let request = join_request_with_proof("space-1", &subject, &nonce, SpaceRole::Member);

        let first =
            try_auto_approve_via_invite(&repo, "space-1", &request, SystemTime::now()).await;
        assert_eq!(
            first,
            Some(SpaceRole::Member),
            "first redemption must succeed"
        );

        let second =
            try_auto_approve_via_invite(&repo, "space-1", &request, SystemTime::now()).await;
        assert_eq!(
            second, None,
            "replaying the same single-use nonce must be refused"
        );
    }

    /// A multi-use invite tolerates repeated redemption.
    #[tokio::test]
    async fn multi_use_invite_allows_repeated_redemption() {
        let repo = FakeInviteRepo::default();
        let nonce = b"nonce-1".to_vec();
        let id = encode_nonce_id(&nonce);
        let mut invite = seed_invite(&repo, "space-1", &id, SpaceRole::Viewer);
        invite.multi_use = true;
        repo.seed(invite);

        let request =
            join_request_with_proof("space-1", &PeerId::random(), &nonce, SpaceRole::Viewer);
        for attempt in 0..3 {
            let role =
                try_auto_approve_via_invite(&repo, "space-1", &request, SystemTime::now()).await;
            assert_eq!(
                role,
                Some(SpaceRole::Viewer),
                "multi-use redemption {attempt} should succeed"
            );
        }
    }

    /// Mandatory regression test: an invite for space A cannot be
    /// redeemed against space B.
    #[tokio::test]
    async fn invite_for_space_a_cannot_be_redeemed_against_space_b() {
        let repo = FakeInviteRepo::default();
        let nonce = b"nonce-1".to_vec();
        let id = encode_nonce_id(&nonce);
        seed_invite(&repo, "space-A", &id, SpaceRole::Editor);

        // Requester claims space-B in the JoinRequest, but the proof
        // carries the EXACT SAME nonce as the space-A invite.
        let request =
            join_request_with_proof("space-B", &PeerId::random(), &nonce, SpaceRole::Editor);

        let role = try_auto_approve_via_invite(&repo, "space-B", &request, SystemTime::now()).await;
        assert_eq!(
            role, None,
            "an invite issued for a different space must never auto-approve"
        );

        // The original space-A invite must remain unconsumed.
        let stored = repo.get("space-A", &id).await.expect("get").expect("row");
        assert_eq!(stored.redeemed_count, 0);
    }

    /// Mandatory regression test: a revoked invite is rejected.
    #[tokio::test]
    async fn revoked_invite_is_rejected() {
        let repo = FakeInviteRepo::default();
        let nonce = b"nonce-1".to_vec();
        let id = encode_nonce_id(&nonce);
        seed_invite(&repo, "space-1", &id, SpaceRole::Member);
        assert!(repo.revoke("space-1", &id, 123).await.expect("revoke") > 0);

        let request =
            join_request_with_proof("space-1", &PeerId::random(), &nonce, SpaceRole::Member);
        let role = try_auto_approve_via_invite(&repo, "space-1", &request, SystemTime::now()).await;
        assert_eq!(role, None, "a revoked invite must never auto-approve");
    }

    /// An expired invite (server-side clock, independent of the offline
    /// inspector) must not auto-approve either.
    #[tokio::test]
    async fn expired_invite_does_not_auto_approve() {
        let repo = FakeInviteRepo::default();
        let nonce = b"nonce-1".to_vec();
        let id = encode_nonce_id(&nonce);
        let mut invite = seed_invite(&repo, "space-1", &id, SpaceRole::Member);
        invite.expires_at = Some(epoch_seconds(SystemTime::now()) - 1);
        repo.seed(invite);

        let request =
            join_request_with_proof("space-1", &PeerId::random(), &nonce, SpaceRole::Member);
        let role = try_auto_approve_via_invite(&repo, "space-1", &request, SystemTime::now()).await;
        assert_eq!(role, None);
    }

    /// A `JoinRequest` with no invite proof at all falls through cleanly
    /// (the existing manual/delegation paths handle it) rather than
    /// erroring.
    #[tokio::test]
    async fn request_without_invite_proof_falls_through() {
        let repo = FakeInviteRepo::default();
        let request = JoinRequest {
            space_id: Some(ProtoSpaceId {
                value: "space-1".into(),
            }),
            peer_id: Some(ProtoPeerId {
                value: PeerId::random().to_string(),
            }),
            display_name: String::new(),
            device_name: String::new(),
            requester_code: String::new(),
            requested_role: SpaceRole::Member as i32,
            invite_proof: None,
            created_at: None,
        };
        let role = try_auto_approve_via_invite(&repo, "space-1", &request, SystemTime::now()).await;
        assert_eq!(role, None);
    }

    /// `revoke_invite` is owner-gated.
    #[tokio::test]
    async fn revoke_invite_rejects_a_non_owner_caller() {
        let owner = keypair();
        let owner_peer = owner.public().to_peer_id();
        let provider = FakeRepositoryProvider::default();
        seed_owned_space(&provider, "space-1", &owner_peer).await;

        let summary = create_invite(
            &provider,
            &owner,
            &owner_peer,
            "space-1",
            SpaceRole::Member,
            None,
            Vec::new(),
            String::new(),
            false,
        )
        .await
        .expect("create invite");

        let stranger = PeerId::random();
        let err = revoke_invite(&provider, &stranger, "space-1", &summary.id)
            .await
            .expect_err("non-owner must not be able to revoke");
        assert!(format!("{err}").contains("owner"));
    }

    #[tokio::test]
    async fn create_invite_rejects_a_non_owner_caller() {
        let owner_peer = PeerId::random();
        let provider = FakeRepositoryProvider::default();
        seed_owned_space(&provider, "space-1", &owner_peer).await;

        let stranger = keypair();
        let err = create_invite(
            &provider,
            &stranger,
            &stranger.public().to_peer_id(),
            "space-1",
            SpaceRole::Member,
            None,
            Vec::new(),
            String::new(),
            false,
        )
        .await
        .expect_err("non-owner must not be able to create invites");
        assert!(format!("{err}").contains("owner"));
    }
}
