use libp2p::{
    PeerId,
    identity::PublicKey,
};
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
        return Err(Error::service("membership signer does not match public key"));
    }

    if !signer_pub.verify(&signed.cbor, &signed.signature) {
        return Err(Error::service("membership signature verification failed"));
    }

    verify_membership_subject(cap, subject_peer_id)?;
    verify_expires_at(cap.expires_at.as_ref(), now, "membership capability expired")?;
    verify_membership_issuer(cap, &signer_peer_id)
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

    verify_expires_at(cap.expires_at.as_ref(), now, "issuer capability expired")
}

fn verify_membership_subject(cap: &MembershipCapability, subject_peer_id: &PeerId) -> SomaResult<()> {
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

fn verify_expires_at(
    expires_at: Option<&prost_types::Timestamp>,
    now: SystemTime,
    message: &'static str,
) -> SomaResult<()> {
    let now_secs = now
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    if expires_at.map(|exp| exp.seconds <= now_secs).unwrap_or(false) {
        Err(Error::service(message))
    } else {
        Ok(())
    }
}
