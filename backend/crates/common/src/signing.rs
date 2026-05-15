use crate::views::{encode_cbor, issuer_view, membership_view};
use libp2p::identity::Keypair;
use soma_core::{Error, SomaResult};
use soma_proto_build::space::{
    CborSigned, IssuerCapability, MembershipCapability, PeerId as ProtoPeerId,
};

/// Sign a membership capability with the provided libp2p identity.
pub fn sign_membership_capability(
    cap: &mut MembershipCapability,
    signer: &Keypair,
) -> SomaResult<()> {
    let payload = encode_cbor(&membership_view(cap))?;
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

pub fn sign_issuer_capability(cap: &mut IssuerCapability, signer: &Keypair) -> SomaResult<()> {
    let payload = encode_cbor(&issuer_view(cap))?;
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
