use ciborium::ser::into_writer;
use libp2p::{
    identity::{Keypair, PublicKey},
    PeerId,
};
use serde::Serialize;
use soma_core::{Error, SomaResult};
use soma_proto_build::space::{
    CborSigned, IssuerCapability, MembershipCapability, PeerId as ProtoPeerId,
};
use std::time::SystemTime;

#[derive(Serialize)]
struct TimestampView {
    seconds: i64,
    nanos: i32,
}

// Encode signing payloads as CBOR arrays (deterministic order).
#[derive(Serialize)]
struct IssuerCapabilitySigningView(
    Option<String>,
    Option<String>,
    Vec<i32>,
    Vec<i32>,
    Option<TimestampView>,
    Option<TimestampView>,
    Option<TimestampView>,
    Option<u32>,
    Option<String>,
);

#[derive(Serialize)]
struct MembershipSigningView(
    Option<String>,
    Option<String>,
    i32,
    Vec<i32>,
    Option<TimestampView>,
    Option<TimestampView>,
    Option<String>,
    Option<IssuerCapabilitySigningView>,
);

/// Sign a membership capability with the provided libp2p identity.
///
/// For now, we serialize a deterministic JSON view (field order stable) and
/// record it as the `cbor` payload in `CborSigned`.
pub fn sign_membership_capability(
    cap: &mut MembershipCapability,
    signer: &Keypair,
) -> SomaResult<()> {
    let signing_view = membership_view(cap);

    let payload = encode_cbor(&signing_view)?;
    let signature = signer
        .sign(&payload)
        .map_err(|err| Error::service(format!("sign membership: {err}")))?;

    let signer_peer_id = signer.public().to_peer_id().to_string();
    cap.signed = Some(CborSigned {
        cbor: payload,
        signer_peer_id: Some(ProtoPeerId {
            value: signer_peer_id,
        }),
        signature,
        alg: "libp2p-ecdsa-cbor".into(),
    });

    Ok(())
}

pub fn sign_issuer_capability(cap: &mut IssuerCapability, signer: &Keypair) -> SomaResult<()> {
    let signing_view = issuer_view(cap);
    let payload = encode_cbor(&signing_view)?;
    let signature = signer
        .sign(&payload)
        .map_err(|err| Error::service(format!("sign issuer capability: {err}")))?;

    let signer_peer_id = signer.public().to_peer_id().to_string();
    cap.signed = Some(CborSigned {
        cbor: payload,
        signer_peer_id: Some(ProtoPeerId {
            value: signer_peer_id,
        }),
        signature,
        alg: "libp2p-ecdsa-cbor".into(),
    });

    Ok(())
}

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
        return Err(Error::service(
            "membership signer does not match public key",
        ));
    }

    if !signer_pub.verify(&signed.cbor, &signed.signature) {
        return Err(Error::service("membership signature verification failed"));
    }

    let subject_ok = cap
        .subject_peer_id
        .as_ref()
        .map(|p| p.value == subject_peer_id.to_string())
        .unwrap_or(false);
    if !subject_ok {
        return Err(Error::service("membership subject mismatch"));
    }

    let now_secs = now
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    if let Some(exp) = cap.expires_at.as_ref() {
        if exp.seconds <= now_secs {
            return Err(Error::service("membership capability expired"));
        }
    }

    let issuer_matches_signer = cap
        .issuer_peer_id
        .as_ref()
        .map(|p| p.value == signer_peer_id.to_string())
        .unwrap_or(false);
    if !issuer_matches_signer {
        return Err(Error::service(
            "membership issuer does not match capability signer",
        ));
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

    let now_secs = now
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    if let Some(exp) = cap.expires_at.as_ref() {
        if exp.seconds <= now_secs {
            return Err(Error::service("issuer capability expired"));
        }
    }

    Ok(())
}

fn ts_view(ts: &prost_types::Timestamp) -> TimestampView {
    TimestampView {
        seconds: ts.seconds,
        nanos: ts.nanos,
    }
}

fn membership_view(cap: &MembershipCapability) -> MembershipSigningView {
    MembershipSigningView(
        cap.space_id.as_ref().map(|s| s.value.clone()),
        cap.subject_peer_id.as_ref().map(|s| s.value.clone()),
        cap.role,
        cap.permissions.clone(),
        cap.issued_at.as_ref().map(ts_view),
        cap.expires_at.as_ref().map(ts_view),
        cap.issuer_peer_id.as_ref().map(|p| p.value.clone()),
        cap.issuer_cap.as_ref().map(issuer_view),
    )
}

fn issuer_view(cap: &IssuerCapability) -> IssuerCapabilitySigningView {
    IssuerCapabilitySigningView(
        cap.space_id.as_ref().map(|s| s.value.clone()),
        cap.issuer_peer_id.as_ref().map(|s| s.value.clone()),
        cap.allowed_roles.clone(),
        cap.default_permissions.clone(),
        cap.issued_at.as_ref().map(ts_view),
        cap.expires_at.as_ref().map(ts_view),
        cap.max_member_expires_at.as_ref().map(ts_view),
        if cap.max_issues_per_hour == 0 {
            None
        } else {
            Some(cap.max_issues_per_hour)
        },
        cap.owner_peer_id.as_ref().map(|s| s.value.clone()),
    )
}

fn encode_cbor<T: Serialize>(value: &T) -> SomaResult<Vec<u8>> {
    let mut buf = Vec::new();
    into_writer(value, &mut buf).map_err(Error::service)?;
    Ok(buf)
}

#[cfg(test)]
mod tests {
    use super::*;
    use prost_types::Timestamp;
    use soma_proto_build::space;

    fn ts_from_secs(secs: i64) -> Timestamp {
        Timestamp {
            seconds: secs,
            nanos: 0,
        }
    }

    #[test]
    fn membership_verify_ok() {
        let keypair = Keypair::generate_ed25519();
        let peer_id = keypair.public().to_peer_id();
        let mut cap = MembershipCapability {
            space_id: Some(space::SpaceId {
                value: "space-1".into(),
            }),
            subject_peer_id: Some(space::PeerId {
                value: peer_id.to_string(),
            }),
            role: 1,
            permissions: vec![],
            issued_at: Some(ts_from_secs(10)),
            expires_at: Some(ts_from_secs(10_000)),
            issuer_peer_id: Some(space::PeerId {
                value: peer_id.to_string(),
            }),
            issuer_cap: None,
            signed: None,
        };

        sign_membership_capability(&mut cap, &keypair).expect("sign");
        verify_membership_capability(&cap, &keypair.public(), &peer_id, SystemTime::UNIX_EPOCH)
            .expect("verify");
    }

    #[test]
    fn membership_verify_rejects_wrong_subject() {
        let keypair = Keypair::generate_ed25519();
        let peer_id = keypair.public().to_peer_id();
        let mut cap = MembershipCapability {
            space_id: Some(space::SpaceId {
                value: "space-1".into(),
            }),
            subject_peer_id: Some(space::PeerId {
                value: peer_id.to_string(),
            }),
            role: 1,
            permissions: vec![],
            issued_at: Some(ts_from_secs(10)),
            expires_at: Some(ts_from_secs(10_000)),
            issuer_peer_id: Some(space::PeerId {
                value: peer_id.to_string(),
            }),
            issuer_cap: None,
            signed: None,
        };

        sign_membership_capability(&mut cap, &keypair).expect("sign");
        let other = PeerId::random();
        let err =
            verify_membership_capability(&cap, &keypair.public(), &other, SystemTime::UNIX_EPOCH)
                .expect_err("should fail");
        assert!(
            format!("{err}").contains("subject"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn membership_verify_rejects_wrong_issuer() {
        let signer = Keypair::generate_ed25519();
        let peer_id = signer.public().to_peer_id();
        let mut cap = MembershipCapability {
            space_id: Some(space::SpaceId {
                value: "space-1".into(),
            }),
            subject_peer_id: Some(space::PeerId {
                value: peer_id.to_string(),
            }),
            role: 1,
            permissions: vec![],
            issued_at: Some(ts_from_secs(10)),
            expires_at: Some(ts_from_secs(10_000)),
            issuer_peer_id: Some(space::PeerId {
                value: PeerId::random().to_string(),
            }),
            issuer_cap: None,
            signed: None,
        };

        sign_membership_capability(&mut cap, &signer).expect("sign");
        let err =
            verify_membership_capability(&cap, &signer.public(), &peer_id, SystemTime::UNIX_EPOCH)
                .expect_err("should fail");
        assert!(
            format!("{err}").contains("issuer does not match"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn membership_verify_rejects_expired() {
        let keypair = Keypair::generate_ed25519();
        let peer_id = keypair.public().to_peer_id();
        let mut cap = MembershipCapability {
            space_id: Some(space::SpaceId {
                value: "space-1".into(),
            }),
            subject_peer_id: Some(space::PeerId {
                value: peer_id.to_string(),
            }),
            role: 1,
            permissions: vec![],
            issued_at: Some(ts_from_secs(10)),
            expires_at: Some(ts_from_secs(20)),
            issuer_peer_id: Some(space::PeerId {
                value: peer_id.to_string(),
            }),
            issuer_cap: None,
            signed: None,
        };

        sign_membership_capability(&mut cap, &keypair).expect("sign");
        let err = verify_membership_capability(
            &cap,
            &keypair.public(),
            &peer_id,
            SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(30),
        )
        .expect_err("should fail");
        assert!(
            format!("{err}").contains("expired"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn membership_verify_rejects_wrong_key() {
        let signer = Keypair::generate_ed25519();
        let peer_id = signer.public().to_peer_id();
        let mut cap = MembershipCapability {
            space_id: Some(space::SpaceId {
                value: "space-1".into(),
            }),
            subject_peer_id: Some(space::PeerId {
                value: peer_id.to_string(),
            }),
            role: 1,
            permissions: vec![],
            issued_at: Some(ts_from_secs(10)),
            expires_at: Some(ts_from_secs(10_000)),
            issuer_peer_id: Some(space::PeerId {
                value: peer_id.to_string(),
            }),
            issuer_cap: None,
            signed: None,
        };
        sign_membership_capability(&mut cap, &signer).expect("sign");

        let other = Keypair::generate_ed25519();
        let err =
            verify_membership_capability(&cap, &other.public(), &peer_id, SystemTime::UNIX_EPOCH)
                .expect_err("should fail");
        assert!(
            format!("{err}").contains("signer does not match"),
            "unexpected error: {err}"
        );
    }
}
