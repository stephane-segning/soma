use crate::signing::{issuer_signing_payload, membership_signing_payload};
use libp2p::{PeerId, identity::PublicKey};
use soma_core::{Error, SomaResult};
use soma_proto_build::space::{IssuerCapability, MembershipCapability};
use std::time::SystemTime;

/// Verify a membership capability signature, subject, and expiry.
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
/// Use this when `cap.issuer_cap` is present and the owner public key is known
/// from Identify or another trusted peer-key source.
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
    issuer_cap
        .allowed_roles
        .iter()
        .any(|allowed| *allowed == role)
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
