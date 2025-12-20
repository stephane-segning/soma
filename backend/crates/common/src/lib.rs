use libp2p::identity::Keypair;
use serde::Serialize;
use soma_core::{Error, SomaResult};
use soma_proto_build::spaceroom::{CborSigned, IssuerCapability, MembershipCapability, PeerId as ProtoPeerId};

#[derive(Serialize)]
struct TimestampView {
    seconds: i64,
    nanos: i32,
}

#[derive(Serialize)]
struct IssuerCapabilityView {
    space_id: Option<String>,
    issuer_peer_id: Option<String>,
    allowed_roles: Vec<i32>,
    default_permissions: Vec<i32>,
    issued_at: Option<TimestampView>,
    expires_at: Option<TimestampView>,
    max_member_expires_at: Option<TimestampView>,
    owner_peer_id: Option<String>,
}

#[derive(Serialize)]
struct MembershipSigningView {
    space_id: Option<String>,
    subject_peer_id: Option<String>,
    role: i32,
    permissions: Vec<i32>,
    issued_at: Option<TimestampView>,
    expires_at: Option<TimestampView>,
    issuer_peer_id: Option<String>,
    issuer_cap: Option<IssuerCapabilityView>,
}

/// Sign a membership capability with the provided libp2p identity.
///
/// For now, we serialize a deterministic JSON view (field order stable) and
/// record it as the `cbor` payload in `CborSigned`.
pub fn sign_membership_capability(
    cap: &mut MembershipCapability,
    signer: &Keypair,
) -> SomaResult<()> {
    let signing_view = MembershipSigningView {
        space_id: cap.space_id.as_ref().map(|s| s.value.clone()),
        subject_peer_id: cap.subject_peer_id.as_ref().map(|s| s.value.clone()),
        role: cap.role,
        permissions: cap.permissions.clone(),
        issued_at: cap.issued_at.as_ref().map(ts_view),
        expires_at: cap.expires_at.as_ref().map(ts_view),
        issuer_peer_id: cap.issuer_peer_id.as_ref().map(|p| p.value.clone()),
        issuer_cap: cap.issuer_cap.as_ref().map(issuer_view),
    };

    let payload = serde_json::to_vec(&signing_view).map_err(Error::service)?;
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
        alg: "libp2p-ecdsa-json".into(),
    });

    Ok(())
}

fn ts_view(ts: &prost_types::Timestamp) -> TimestampView {
    TimestampView {
        seconds: ts.seconds,
        nanos: ts.nanos,
    }
}

fn issuer_view(cap: &IssuerCapability) -> IssuerCapabilityView {
    IssuerCapabilityView {
        space_id: cap.space_id.as_ref().map(|s| s.value.clone()),
        issuer_peer_id: cap.issuer_peer_id.as_ref().map(|s| s.value.clone()),
        allowed_roles: cap.allowed_roles.clone(),
        default_permissions: cap.default_permissions.clone(),
        issued_at: cap.issued_at.as_ref().map(ts_view),
        expires_at: cap.expires_at.as_ref().map(ts_view),
        max_member_expires_at: cap.max_member_expires_at.as_ref().map(ts_view),
        owner_peer_id: cap.owner_peer_id.as_ref().map(|s| s.value.clone()),
    }
}
