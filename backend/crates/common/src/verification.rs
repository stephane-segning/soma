use crate::signing::{
    invite_state_signing_payload, issuer_signing_payload, membership_signing_payload,
};
use libp2p::{PeerId, identity::PublicKey};
use soma_core::{Error, SomaResult};
use soma_proto_build::space::{InviteState, IssuerCapability, MembershipCapability};
use std::time::SystemTime;

/// Verify a membership capability's signature, subject, and expiry.
///
/// # This proves self-consistency only — not authority
///
/// This function proves the capability is *internally consistent*: the
/// signature over `cap`'s signing payload verifies against `signer_pub`,
/// and `cap.issuer_peer_id` matches that same signer. It does **not**
/// prove `signer_pub` is actually the space's owner, or anyone the owner
/// delegated to — every field being cross-checked here can live inside
/// the same attacker-authored payload. A caller that calls this alone and
/// then trusts the result as "this signer may act for the space" has
/// reproduced exactly the membership-forgery gap documented in
/// `docs/src/security/threat-model.md` §"Unauthorized membership /
/// capability forgery".
///
/// For anything reached over the network (e.g. an inbound
/// `/soma/join-decision/1` message), use
/// `soma_membership::verify_and_apply_inbound_join_decision` instead,
/// which binds this check to a locally-pinned trust anchor before
/// persisting anything. Call this function directly only when the caller
/// already has independent, out-of-band grounds to trust `signer_pub`
/// for this exact capability (e.g. it's the space's already-verified
/// owner key).
pub fn verify_membership_capability(
    cap: &MembershipCapability,
    signer_pub: &PublicKey,
    subject_peer_id: &PeerId,
    now: SystemTime,
) -> SomaResult<()> {
    verify_membership_capability_inner(cap, signer_pub, subject_peer_id, None, now)
}

/// Verify a membership capability plus its owner -> issuer delegation chain.
///
/// Use this when `cap.issuer_cap` is present and the owner public key is
/// known from Identify or another trusted peer-key source.
///
/// The same self-consistency-only caveat as [`verify_membership_capability`]
/// applies to `owner_pub` itself: this function verifies the delegation
/// chain correctly *given* that `owner_pub` really is the space's owner —
/// it has no way to check that premise. If `owner_pub` was resolved from
/// a peer ID read out of the capability being verified (e.g.
/// `issuer_cap.owner_peer_id`) rather than from a locally-pinned trust
/// anchor, the caller has not actually verified anything about authority,
/// only that *some* signature over *some* claimed owner is valid — see
/// `soma_membership::verify_and_apply_inbound_join_decision` for the
/// anchor-aware wrapper this is meant to be called from for any inbound,
/// untrusted message.
pub fn verify_membership_capability_with_owner_key(
    cap: &MembershipCapability,
    signer_pub: &PublicKey,
    owner_pub: &PublicKey,
    subject_peer_id: &PeerId,
    now: SystemTime,
) -> SomaResult<()> {
    verify_membership_capability_inner(cap, signer_pub, subject_peer_id, Some(owner_pub), now)
}

fn verify_membership_capability_inner(
    cap: &MembershipCapability,
    signer_pub: &PublicKey,
    subject_peer_id: &PeerId,
    owner_pub: Option<&PublicKey>,
    now: SystemTime,
) -> SomaResult<()> {
    let signed = cap
        .signed
        .as_ref()
        .ok_or_else(|| Error::service("membership capability missing signature"))?;

    let signer_peer_id = signer_pub.to_peer_id();
    let signed_peer_id = signed
        .signer_peer_id
        .as_ref()
        .map(|p| p.value.clone())
        .unwrap_or_default();
    if signer_peer_id.to_string() != signed_peer_id {
        return Err(Error::service(
            "membership signer does not match public key",
        ));
    }

    if !signer_pub.verify(&signed.cbor, &signed.signature) {
        return Err(Error::service("membership signature verification failed"));
    }

    let expected = membership_signing_payload(cap)?;
    if signed.cbor != expected {
        return Err(Error::service("membership payload mismatch"));
    }

    verify_membership_subject(cap, subject_peer_id)?;
    verify_expires_at(
        cap.expires_at.as_ref(),
        now,
        "membership capability expired",
    )?;
    verify_membership_issuer(cap, &signer_peer_id)?;

    if let Some(issuer_cap) = cap.issuer_cap.as_ref() {
        verify_membership_issuer_capability(cap, issuer_cap, &signer_peer_id, owner_pub, now)?;
    }

    Ok(())
}

/// Verify an issuer capability signature and expiry.
pub fn verify_issuer_capability(
    cap: &IssuerCapability,
    signer_pub: &PublicKey,
    now: SystemTime,
) -> SomaResult<()> {
    let signed = cap
        .signed
        .as_ref()
        .ok_or_else(|| Error::service("issuer capability missing signature"))?;

    let signer_peer_id = signer_pub.to_peer_id();
    let signed_peer_id = signed
        .signer_peer_id
        .as_ref()
        .map(|p| p.value.clone())
        .unwrap_or_default();
    if signer_peer_id.to_string() != signed_peer_id {
        return Err(Error::service("issuer signer does not match public key"));
    }

    if !signer_pub.verify(&signed.cbor, &signed.signature) {
        return Err(Error::service("issuer signature verification failed"));
    }

    let expected = issuer_signing_payload(cap)?;
    if signed.cbor != expected {
        return Err(Error::service("issuer payload mismatch"));
    }

    verify_expires_at(cap.expires_at.as_ref(), now, "issuer capability expired")
}

/// Verify an `InviteState` **with zero network access and zero prior
/// relationship to the signer** -- the whole point of a self-contained
/// `soma://` invite link (see `soma_membership::invite`).
///
/// # Why this is the one exception to "always resolve keys via
/// `PeerKeyResolver`"
///
/// Every other verifier in this crate (`verify_membership_capability`,
/// `verify_issuer_capability`) takes the signer's [`PublicKey`] as a
/// parameter, sourced by the caller from
/// `soma_membership::trust::PeerKeyResolver` / `TrustAnchor` -- i.e. from
/// LOCAL state the remote party doesn't control. An invite has no such
/// local state to draw on: it must be checkable *before* the invitee has
/// ever talked to the issuer, which is the entire reason invites are a
/// better trust anchor than a bare pasted peer id (see
/// `docs/src/space-authorization-model.md`). So the public key has to
/// come from the artifact itself (`signed.signer_public_key`, populated
/// only by [`crate::sign_invite_state`]) -- this is NOT a general license
/// to trust a key embedded in a payload; it is safe *only* because:
///
///   1. the embedded key must match `signed.signer_peer_id`
///      (self-consistency -- the two "who signed this" claims agree), and
///   2. the signature over `signed.cbor` must actually verify against
///      that same key, and
///   3. `signed.cbor` must equal the freshly-recomputed signing view of
///      the CURRENT field values (rejects any post-signature tampering).
///
/// All three together prove: "the holder of the private key matching
/// `signed.signer_peer_id` really did sign exactly these invite terms."
/// That is the full extent of what this function proves. It does **not**
/// prove that peer is trustworthy, well-known, or the space's "real"
/// owner in any global sense -- accepting an invite is unavoidably a
/// trust-on-first-use decision (same as any invite-link system). The
/// caller (`soma_membership::invite::redeem_invite`) is responsible for
/// routing the resulting peer id through `TrustAnchor`/`pin_trust_anchor`
/// like any other first contact, never bypassing it.
///
/// Returns the verified signer [`PublicKey`] on success so the caller can
/// derive the issuer's `PeerId` and cache the key (e.g. into
/// `peer_public_keys`) without a separate Identify round trip.
///
/// Checks the signature and payload integrity only -- **not** expiry. Most
/// callers want [`verify_invite_state`] (signature + expiry together);
/// this split exists so a caller that needs to distinguish "forged" from
/// "expired" (e.g. an invitee-facing inspection screen) can do so without
/// parsing an error string. See that function's doc comment for the full
/// rationale of why an embedded key is safe to trust here at all.
pub fn verify_invite_signature(state: &InviteState) -> SomaResult<PublicKey> {
    let signed = state
        .signed
        .as_ref()
        .ok_or_else(|| Error::service("invite missing signature"))?;

    let signer_pub = PublicKey::try_decode_protobuf(&signed.signer_public_key)
        .map_err(|_| Error::service("invite signer public key malformed"))?;

    let signer_peer_id = signer_pub.to_peer_id();
    let signed_peer_id = signed
        .signer_peer_id
        .as_ref()
        .map(|p| p.value.clone())
        .unwrap_or_default();
    if signer_peer_id.to_string() != signed_peer_id {
        return Err(Error::service(
            "invite signer public key does not match claimed signer peer id",
        ));
    }

    if !signer_pub.verify(&signed.cbor, &signed.signature) {
        return Err(Error::service("invite signature verification failed"));
    }

    let expected = invite_state_signing_payload(state)?;
    if signed.cbor != expected {
        return Err(Error::service("invite payload mismatch"));
    }

    Ok(signer_pub)
}

/// [`verify_invite_signature`] plus an expiry check -- the combined,
/// fail-closed gate `soma_membership::invite::redeem_invite` uses, where
/// there's no need to distinguish *why* an invite was rejected.
pub fn verify_invite_state(state: &InviteState, now: SystemTime) -> SomaResult<PublicKey> {
    let signer_pub = verify_invite_signature(state)?;
    verify_expires_at(state.expires_at.as_ref(), now, "invite expired")?;
    Ok(signer_pub)
}

fn verify_membership_subject(
    cap: &MembershipCapability,
    subject_peer_id: &PeerId,
) -> SomaResult<()> {
    let subject_ok = cap
        .subject_peer_id
        .as_ref()
        .map(|p| p.value == subject_peer_id.to_string())
        .unwrap_or(false);
    if subject_ok {
        Ok(())
    } else {
        Err(Error::service("membership subject mismatch"))
    }
}

fn verify_membership_issuer(cap: &MembershipCapability, signer_peer_id: &PeerId) -> SomaResult<()> {
    let issuer_matches_signer = cap
        .issuer_peer_id
        .as_ref()
        .map(|p| p.value == signer_peer_id.to_string())
        .unwrap_or(false);
    if issuer_matches_signer {
        Ok(())
    } else {
        Err(Error::service(
            "membership issuer does not match capability signer",
        ))
    }
}

fn verify_membership_issuer_capability(
    cap: &MembershipCapability,
    issuer_cap: &IssuerCapability,
    signer_peer_id: &PeerId,
    owner_pub: Option<&PublicKey>,
    now: SystemTime,
) -> SomaResult<()> {
    let issuer_peer = signer_peer_id.to_string();
    let delegated_peer_ok = issuer_cap
        .issuer_peer_id
        .as_ref()
        .map(|p| p.value == issuer_peer)
        .unwrap_or(false);
    if !delegated_peer_ok {
        return Err(Error::service("issuer capability delegate mismatch"));
    }

    let space_ok = cap
        .space_id
        .as_ref()
        .zip(issuer_cap.space_id.as_ref())
        .map(|(membership_space, issuer_space)| membership_space.value == issuer_space.value)
        .unwrap_or(false);
    if !space_ok {
        return Err(Error::service("issuer capability space mismatch"));
    }

    if !issuer_allows_role(issuer_cap, cap.role) {
        return Err(Error::service(
            "issuer capability does not allow membership role",
        ));
    }

    verify_expires_at(
        issuer_cap.expires_at.as_ref(),
        now,
        "issuer capability expired",
    )?;

    if let Some(max_member_expires_at) = issuer_cap.max_member_expires_at.as_ref() {
        let Some(member_expires_at) = cap.expires_at.as_ref() else {
            return Err(Error::service(
                "membership expiry exceeds issuer capability limit",
            ));
        };
        if timestamp_gt(member_expires_at, max_member_expires_at) {
            return Err(Error::service(
                "membership expiry exceeds issuer capability limit",
            ));
        }
    }

    let Some(owner_pub) = owner_pub else {
        return Err(Error::service(
            "owner public key required for delegated membership verification",
        ));
    };
    let owner_peer = owner_pub.to_peer_id().to_string();
    let cap_owner_ok = issuer_cap
        .owner_peer_id
        .as_ref()
        .map(|p| p.value == owner_peer)
        .unwrap_or(false);
    if !cap_owner_ok {
        return Err(Error::service(
            "issuer capability owner does not match public key",
        ));
    }

    verify_issuer_capability(issuer_cap, owner_pub, now)
}

fn issuer_allows_role(issuer_cap: &IssuerCapability, role: i32) -> bool {
    if issuer_cap.allowed_roles.is_empty() {
        return true;
    }
    issuer_cap.allowed_roles.contains(&role)
}

fn timestamp_gt(left: &prost_types::Timestamp, right: &prost_types::Timestamp) -> bool {
    left.seconds > right.seconds || (left.seconds == right.seconds && left.nanos > right.nanos)
}

fn verify_expires_at(
    expires_at: Option<&prost_types::Timestamp>,
    now: SystemTime,
    message: &'static str,
) -> SomaResult<()> {
    let now_secs = now
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    if expires_at
        .map(|exp| exp.seconds <= now_secs)
        .unwrap_or(false)
    {
        Err(Error::service(message))
    } else {
        Ok(())
    }
}
