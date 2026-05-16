use ciborium::ser::into_writer;
use serde::Serialize;
use soma_core::{Error, SomaResult};
use soma_proto_build::space::{IssuerCapability, MembershipCapability, SpaceGenesisArtifact};

#[derive(Serialize)]
struct TimestampView {
    seconds: i64,
    nanos: i32,
}

#[derive(Serialize)]
pub(crate) struct IssuerCapabilitySigningView(
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
pub(crate) struct MembershipSigningView(
    Option<String>,
    Option<String>,
    i32,
    Vec<i32>,
    Option<TimestampView>,
    Option<TimestampView>,
    Option<String>,
    Option<IssuerCapabilitySigningView>,
);

#[derive(Serialize)]
pub(crate) struct SpaceGenesisSigningView(
    Option<String>,
    Option<String>,
    Option<String>,
    Option<TimestampView>,
);

pub(crate) fn membership_view(cap: &MembershipCapability) -> MembershipSigningView {
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

pub(crate) fn space_genesis_view(genesis: &SpaceGenesisArtifact) -> SpaceGenesisSigningView {
    SpaceGenesisSigningView(
        genesis.space_id.as_ref().map(|s| s.value.clone()),
        genesis.owner_peer_id.as_ref().map(|p| p.value.clone()),
        genesis.display_name.clone(),
        genesis.created_at.as_ref().map(ts_view),
    )
}

pub(crate) fn issuer_view(cap: &IssuerCapability) -> IssuerCapabilitySigningView {
    IssuerCapabilitySigningView(
        cap.space_id.as_ref().map(|s| s.value.clone()),
        cap.issuer_peer_id.as_ref().map(|s| s.value.clone()),
        cap.allowed_roles.clone(),
        cap.default_permissions.clone(),
        cap.issued_at.as_ref().map(ts_view),
        cap.expires_at.as_ref().map(ts_view),
        cap.max_member_expires_at.as_ref().map(ts_view),
        nonzero(cap.max_issues_per_hour),
        cap.owner_peer_id.as_ref().map(|s| s.value.clone()),
    )
}

pub(crate) fn encode_cbor<T: Serialize>(value: &T) -> SomaResult<Vec<u8>> {
    let mut buf = Vec::new();
    into_writer(value, &mut buf).map_err(Error::service)?;
    Ok(buf)
}

fn ts_view(ts: &prost_types::Timestamp) -> TimestampView {
    TimestampView {
        seconds: ts.seconds,
        nanos: ts.nanos,
    }
}

fn nonzero(value: u32) -> Option<u32> {
    if value == 0 { None } else { Some(value) }
}
