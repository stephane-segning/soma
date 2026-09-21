use ciborium::ser::into_writer;
use serde::{Deserialize, Serialize};
use soma_core::{Error, SomaResult};
use soma_proto_build::space::{
    InviteState, IssuerCapability, MembershipCapability, SpaceGenesisArtifact,
};

#[derive(Serialize, Deserialize)]
pub(crate) struct TimestampView {
    pub(crate) seconds: i64,
    pub(crate) nanos: i32,
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

/// Signing view for `InviteState`. Field order matches the proto
/// declaration order minus `signed` (never included -- you can't sign a
/// value that contains its own signature), exactly like every other
/// `*SigningView` in this file.
#[derive(Serialize)]
pub(crate) struct InviteStateSigningView(
    Option<String>,        // space_id
    i32,                   // default_role
    Option<TimestampView>, // expires_at
    Vec<String>,           // bootstrap_multiaddrs
    Vec<u8>,               // invite_nonce
    String,                // space_label
);

/// Signing view for the requester-side `InviteProof`. Not derived from a
/// single proto message (the proof is built fresh per redemption, not
/// decoded from one) -- see `soma_common::build_invite_proof`. Mirrors the
/// proto doc comment on `InviteProof`: "signature by requester over
/// (peer_id || ts || nonce || hash(state_signing_view))".
#[derive(Serialize)]
pub(crate) struct InviteProofSigningView(
    String,        // requester peer id
    TimestampView, // ts
    Vec<u8>,       // nonce
    Vec<u8>,       // sha256(state.signed.cbor)
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

pub(crate) fn invite_view(state: &InviteState) -> InviteStateSigningView {
    InviteStateSigningView(
        state.space_id.as_ref().map(|s| s.value.clone()),
        state.default_role,
        state.expires_at.as_ref().map(ts_view),
        state.bootstrap_multiaddrs.clone(),
        state.invite_nonce.clone(),
        state.space_label.clone(),
    )
}

pub(crate) fn invite_proof_view(
    requester_peer_id: &str,
    ts: &prost_types::Timestamp,
    nonce: &[u8],
    state_hash: &[u8],
) -> InviteProofSigningView {
    InviteProofSigningView(
        requester_peer_id.to_string(),
        ts_view(ts),
        nonce.to_vec(),
        state_hash.to_vec(),
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
