use ciborium::ser::into_writer;
use libp2p::identity::Keypair;
use serde::Serialize;
use soma_core::{Error, SomaResult};
use soma_proto_build::spaceroom::{
    CborSigned, IssuerCapability, MembershipCapability, PeerId as ProtoPeerId,
};

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
    let signing_view = MembershipSigningView(
        cap.space_id.as_ref().map(|s| s.value.clone()),
        cap.subject_peer_id.as_ref().map(|s| s.value.clone()),
        cap.role,
        cap.permissions.clone(),
        cap.issued_at.as_ref().map(ts_view),
        cap.expires_at.as_ref().map(ts_view),
        cap.issuer_peer_id.as_ref().map(|p| p.value.clone()),
        cap.issuer_cap.as_ref().map(issuer_view),
    );

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

fn ts_view(ts: &prost_types::Timestamp) -> TimestampView {
    TimestampView {
        seconds: ts.seconds,
        nanos: ts.nanos,
    }
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
