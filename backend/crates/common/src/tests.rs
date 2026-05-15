use super::*;
use libp2p::{PeerId, identity::Keypair};
use prost_types::Timestamp;
use soma_proto_build::space::{self, MembershipCapability};
use std::time::SystemTime;

fn ts_from_secs(secs: i64) -> Timestamp {
    Timestamp { seconds: secs, nanos: 0 }
}

fn signed_membership(
    keypair: &Keypair,
    subject_peer_id: String,
    issuer_peer_id: String,
    expires_at: i64,
) -> MembershipCapability {
    let mut cap = MembershipCapability {
        space_id: Some(space::SpaceId {
            value: "space-1".into(),
        }),
        subject_peer_id: Some(space::PeerId {
            value: subject_peer_id,
        }),
        role: 1,
        permissions: vec![],
        issued_at: Some(ts_from_secs(10)),
        expires_at: Some(ts_from_secs(expires_at)),
        issuer_peer_id: Some(space::PeerId {
            value: issuer_peer_id,
        }),
        issuer_cap: None,
        signed: None,
    };
    sign_membership_capability(&mut cap, keypair).expect("sign");
    cap
}

#[test]
fn membership_verify_ok() {
    let keypair = Keypair::generate_ed25519();
    let peer_id = keypair.public().to_peer_id();
    let cap = signed_membership(&keypair, peer_id.to_string(), peer_id.to_string(), 10_000);

    verify_membership_capability(&cap, &keypair.public(), &peer_id, SystemTime::UNIX_EPOCH)
        .expect("verify");
}

#[test]
fn membership_verify_rejects_wrong_subject() {
    let keypair = Keypair::generate_ed25519();
    let peer_id = keypair.public().to_peer_id();
    let cap = signed_membership(&keypair, peer_id.to_string(), peer_id.to_string(), 10_000);

    let err = verify_membership_capability(
        &cap,
        &keypair.public(),
        &PeerId::random(),
        SystemTime::UNIX_EPOCH,
    )
    .expect_err("should fail");
    assert!(format!("{err}").contains("subject"), "unexpected error: {err}");
}

#[test]
fn membership_verify_rejects_wrong_issuer() {
    let signer = Keypair::generate_ed25519();
    let peer_id = signer.public().to_peer_id();
    let cap = signed_membership(&signer, peer_id.to_string(), PeerId::random().to_string(), 10_000);

    let err = verify_membership_capability(&cap, &signer.public(), &peer_id, SystemTime::UNIX_EPOCH)
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
    let cap = signed_membership(&keypair, peer_id.to_string(), peer_id.to_string(), 20);

    let err = verify_membership_capability(
        &cap,
        &keypair.public(),
        &peer_id,
        SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(30),
    )
    .expect_err("should fail");
    assert!(format!("{err}").contains("expired"), "unexpected error: {err}");
}

#[test]
fn membership_verify_rejects_wrong_key() {
    let signer = Keypair::generate_ed25519();
    let peer_id = signer.public().to_peer_id();
    let cap = signed_membership(&signer, peer_id.to_string(), peer_id.to_string(), 10_000);

    let other = Keypair::generate_ed25519();
    let err = verify_membership_capability(&cap, &other.public(), &peer_id, SystemTime::UNIX_EPOCH)
        .expect_err("should fail");
    assert!(
        format!("{err}").contains("signer does not match"),
        "unexpected error: {err}"
    );
}
