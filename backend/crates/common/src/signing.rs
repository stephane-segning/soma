use crate::views::{
    encode_cbor, invite_proof_view, invite_view, issuer_view, membership_view, space_genesis_view,
};
use libp2p::identity::Keypair;
use prost_types::Timestamp;
use sha2::{Digest, Sha256};
use soma_core::{Error, SomaResult};
use soma_proto_build::space::{
    CborSigned, InviteProof, InviteState, IssuerCapability, MembershipCapability,
    PeerId as ProtoPeerId, SpaceGenesisArtifact,
};
use std::time::SystemTime;

/// Sign a membership capability with the provided libp2p identity.
pub fn sign_membership_capability(
    cap: &mut MembershipCapability,
    signer: &Keypair,
) -> SomaResult<()> {
    let payload = membership_signing_payload(cap)?;
    let signature = signer
        .sign(&payload)
        .map_err(|err| Error::service(format!("sign membership: {err}")))?;

    cap.signed = Some(CborSigned {
        cbor: payload,
        signer_peer_id: Some(ProtoPeerId {
            value: signer.public().to_peer_id().to_string(),
        }),
        signature,
        alg: "libp2p-ecdsa-cbor".into(),
        // Deliberately empty: MembershipCapability is verified exclusively
        // through `soma_membership::trust::PeerKeyResolver` /
        // `TrustAnchor` against a locally-pinned key, never through a key
        // embedded in the payload -- see `CborSigned.signer_public_key`'s
        // doc comment in the proto.
        signer_public_key: Vec::new(),
    });

    Ok(())
}

pub(crate) fn membership_signing_payload(cap: &MembershipCapability) -> SomaResult<Vec<u8>> {
    encode_cbor(&membership_view(cap))
}

pub fn sign_issuer_capability(cap: &mut IssuerCapability, signer: &Keypair) -> SomaResult<()> {
    let payload = issuer_signing_payload(cap)?;
    let signature = signer
        .sign(&payload)
        .map_err(|err| Error::service(format!("sign issuer capability: {err}")))?;

    cap.signed = Some(CborSigned {
        cbor: payload,
        signer_peer_id: Some(ProtoPeerId {
            value: signer.public().to_peer_id().to_string(),
        }),
        signature,
        alg: "libp2p-ecdsa-cbor".into(),
        // Deliberately empty -- see the matching comment in
        // `sign_membership_capability` above.
        signer_public_key: Vec::new(),
    });

    Ok(())
}

pub(crate) fn issuer_signing_payload(cap: &IssuerCapability) -> SomaResult<Vec<u8>> {
    encode_cbor(&issuer_view(cap))
}

pub fn space_genesis_signing_payload(genesis: &SpaceGenesisArtifact) -> SomaResult<Vec<u8>> {
    encode_cbor(&space_genesis_view(genesis))
}

pub fn sign_space_genesis_artifact(
    genesis: &mut SpaceGenesisArtifact,
    signer: &Keypair,
) -> SomaResult<()> {
    let payload = space_genesis_signing_payload(genesis)?;
    let signature = signer
        .sign(&payload)
        .map_err(|err| Error::service(format!("sign space genesis: {err}")))?;

    genesis.signed = Some(CborSigned {
        cbor: payload,
        signer_peer_id: Some(ProtoPeerId {
            value: signer.public().to_peer_id().to_string(),
        }),
        signature,
        alg: "libp2p-ecdsa-cbor".into(),
        signer_public_key: Vec::new(),
    });

    Ok(())
}

pub(crate) fn invite_state_signing_payload(state: &InviteState) -> SomaResult<Vec<u8>> {
    encode_cbor(&invite_view(state))
}

/// Sign an `InviteState` with the issuer's (owner's) libp2p identity.
///
/// Unlike every other `sign_*` in this module, this ALSO embeds the
/// signer's actual public key into `signed.signer_public_key` (see that
/// field's doc comment in the proto). That embedding is what makes
/// [`crate::verify_invite_state`] able to verify the signature with zero
/// network access and zero prior relationship to the signer -- a
/// `soma://` invite link has nowhere else to source the key from, unlike
/// a `MembershipCapability`/`IssuerCapability`, which are always verified
/// through `soma_membership::trust::PeerKeyResolver` against a
/// locally-pinned or Identify-learned key instead.
pub fn sign_invite_state(state: &mut InviteState, signer: &Keypair) -> SomaResult<()> {
    let payload = invite_state_signing_payload(state)?;
    let signature = signer
        .sign(&payload)
        .map_err(|err| Error::service(format!("sign invite state: {err}")))?;

    state.signed = Some(CborSigned {
        cbor: payload,
        signer_peer_id: Some(ProtoPeerId {
            value: signer.public().to_peer_id().to_string(),
        }),
        signature,
        alg: "libp2p-ecdsa-cbor".into(),
        signer_public_key: signer.public().encode_protobuf(),
    });

    Ok(())
}

/// Build a signed `InviteProof` asserting that `requester` is redeeming
/// `state`: a fresh per-proof timestamp + nonce, signed by the requester
/// over `(requester_peer_id, ts, nonce, sha256(state.signed.cbor))` --
/// matching the proto's documented payload shape ("signature by requester
/// over (peer_id || ts || nonce || hash(state_signing_view))").
///
/// `state` must already be signed (`state.signed` populated) -- callers
/// always have this, since a redemption only ever proceeds from a link
/// that already round-tripped through [`crate::verify_invite_state`].
pub fn build_invite_proof(state: &InviteState, requester: &Keypair) -> SomaResult<InviteProof> {
    let signed = state
        .signed
        .as_ref()
        .ok_or_else(|| Error::service("invite state missing signature"))?;

    let requester_peer_id = requester.public().to_peer_id().to_string();
    let ts = Timestamp::from(SystemTime::now());
    let nonce = {
        // Two u64s rather than a byte-array RNG call -- matches the exact
        // `rand::random::<u64>()` pattern already used for id generation
        // elsewhere in this workspace (see `join_decider::approval`),
        // rather than depending on a `rand` 0.9 array-fill API this crate
        // hasn't otherwise exercised.
        let mut bytes = [0u8; 16];
        bytes[..8].copy_from_slice(&rand::random::<u64>().to_be_bytes());
        bytes[8..].copy_from_slice(&rand::random::<u64>().to_be_bytes());
        bytes.to_vec()
    };
    let state_hash = Sha256::digest(&signed.cbor).to_vec();

    let payload = encode_cbor(&invite_proof_view(
        &requester_peer_id,
        &ts,
        &nonce,
        &state_hash,
    ))?;
    let proof = requester
        .sign(&payload)
        .map_err(|err| Error::service(format!("sign invite proof: {err}")))?;

    Ok(InviteProof {
        state: Some(state.clone()),
        ts: Some(ts),
        nonce,
        proof,
        proof_type: "libp2p-ecdsa-cbor".into(),
    })
}
