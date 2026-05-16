use crate::views::{encode_cbor, issuer_view, membership_view, space_genesis_view};
use libp2p::identity::Keypair;
use soma_core::{Error, SomaResult};
use soma_proto_build::space::{
    CborSigned, IssuerCapability, MembershipCapability, PeerId as ProtoPeerId, SpaceGenesisArtifact,
};

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
    });

    Ok(())
}
