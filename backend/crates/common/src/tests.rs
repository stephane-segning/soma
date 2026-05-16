use super::*;
use libp2p::{PeerId, identity::Keypair};
use prost_types::Timestamp;
use soma_proto_build::space::{self, IssuerCapability, MembershipCapability, SpaceRole};
use std::time::SystemTime;

fn ts_from_secs(secs: i64) -> Timestamp {
    Timestamp {
        seconds: secs,
        nanos: 0,
    }
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

fn signed_issuer_capability(
    owner: &Keypair,
    delegate: &Keypair,
    expires_at: i64,
) -> IssuerCapability {
    let mut cap = IssuerCapability {
        space_id: Some(space::SpaceId {
            value: "space-1".into(),
        }),
        issuer_peer_id: Some(space::PeerId {
            value: delegate.public().to_peer_id().to_string(),
        }),
        allowed_roles: vec![SpaceRole::Member as i32],
        default_permissions: vec![],
        issued_at: Some(ts_from_secs(10)),
        expires_at: Some(ts_from_secs(expires_at)),
        max_member_expires_at: None,
        max_issues_per_hour: 0,
        owner_peer_id: Some(space::PeerId {
            value: owner.public().to_peer_id().to_string(),
        }),
        signed: None,
    };
    sign_issuer_capability(&mut cap, owner).expect("sign issuer");
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
    assert!(
        format!("{err}").contains("subject"),
        "unexpected error: {err}"
    );
}

#[test]
fn membership_verify_rejects_wrong_issuer() {
    let signer = Keypair::generate_ed25519();
    let peer_id = signer.public().to_peer_id();
    let cap = signed_membership(
        &signer,
        peer_id.to_string(),
        PeerId::random().to_string(),
        10_000,
    );

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
    let cap = signed_membership(&keypair, peer_id.to_string(), peer_id.to_string(), 20);

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
    let cap = signed_membership(&signer, peer_id.to_string(), peer_id.to_string(), 10_000);

    let other = Keypair::generate_ed25519();
    let err = verify_membership_capability(&cap, &other.public(), &peer_id, SystemTime::UNIX_EPOCH)
        .expect_err("should fail");
    assert!(
        format!("{err}").contains("signer does not match"),
        "unexpected error: {err}"
    );
}

#[test]
fn membership_verify_rejects_tampered_payload() {
    let keypair = Keypair::generate_ed25519();
    let peer_id = keypair.public().to_peer_id();
    let mut cap = signed_membership(&keypair, peer_id.to_string(), peer_id.to_string(), 10_000);
    cap.role = SpaceRole::Viewer as i32;

    let err =
        verify_membership_capability(&cap, &keypair.public(), &peer_id, SystemTime::UNIX_EPOCH)
            .expect_err("should fail");
    assert!(
        format!("{err}").contains("payload mismatch"),
        "unexpected error: {err}"
    );
}

#[test]
fn membership_verify_delegated_issuer_ok_with_owner_key() {
    let owner = Keypair::generate_ed25519();
    let issuer = Keypair::generate_ed25519();
    let subject = Keypair::generate_ed25519();
    let subject_peer_id = subject.public().to_peer_id();
    let issuer_cap = signed_issuer_capability(&owner, &issuer, 10_000);
    let mut cap = signed_membership(
        &issuer,
        subject_peer_id.to_string(),
        issuer.public().to_peer_id().to_string(),
        9_000,
    );
    cap.role = SpaceRole::Member as i32;
    cap.issuer_cap = Some(issuer_cap);
    sign_membership_capability(&mut cap, &issuer).expect("resign membership");

    verify_membership_capability_with_owner_key(
        &cap,
        &issuer.public(),
        &owner.public(),
        &subject_peer_id,
        SystemTime::UNIX_EPOCH,
    )
    .expect("verify");
}

#[test]
fn membership_verify_delegated_rejects_wrong_owner_signature() {
    let owner = Keypair::generate_ed25519();
    let wrong_owner = Keypair::generate_ed25519();
    let issuer = Keypair::generate_ed25519();
    let subject = Keypair::generate_ed25519();
    let subject_peer_id = subject.public().to_peer_id();
    let issuer_cap = signed_issuer_capability(&wrong_owner, &issuer, 10_000);
    let mut cap = signed_membership(
        &issuer,
        subject_peer_id.to_string(),
        issuer.public().to_peer_id().to_string(),
        9_000,
    );
    cap.role = SpaceRole::Member as i32;
    cap.issuer_cap = Some(issuer_cap);
    sign_membership_capability(&mut cap, &issuer).expect("resign membership");

    let err = verify_membership_capability_with_owner_key(
        &cap,
        &issuer.public(),
        &owner.public(),
        &subject_peer_id,
        SystemTime::UNIX_EPOCH,
    )
    .expect_err("should fail");
    assert!(
        format!("{err}").contains("owner does not match"),
        "unexpected error: {err}"
    );
}

#[test]
fn membership_verify_delegated_rejects_mismatched_delegate() {
    let owner = Keypair::generate_ed25519();
    let issuer = Keypair::generate_ed25519();
    let other_issuer = Keypair::generate_ed25519();
    let subject = Keypair::generate_ed25519();
    let subject_peer_id = subject.public().to_peer_id();
    let issuer_cap = signed_issuer_capability(&owner, &other_issuer, 10_000);
    let mut cap = signed_membership(
        &issuer,
        subject_peer_id.to_string(),
        issuer.public().to_peer_id().to_string(),
        9_000,
    );
    cap.role = SpaceRole::Member as i32;
    cap.issuer_cap = Some(issuer_cap);
    sign_membership_capability(&mut cap, &issuer).expect("resign membership");

    let err = verify_membership_capability_with_owner_key(
        &cap,
        &issuer.public(),
        &owner.public(),
        &subject_peer_id,
        SystemTime::UNIX_EPOCH,
    )
    .expect_err("should fail");
    assert!(
        format!("{err}").contains("delegate mismatch"),
        "unexpected error: {err}"
    );
}

#[test]
fn membership_verify_delegated_rejects_expired_issuer() {
    let owner = Keypair::generate_ed25519();
    let issuer = Keypair::generate_ed25519();
    let subject = Keypair::generate_ed25519();
    let subject_peer_id = subject.public().to_peer_id();
    let issuer_cap = signed_issuer_capability(&owner, &issuer, 20);
    let mut cap = signed_membership(
        &issuer,
        subject_peer_id.to_string(),
        issuer.public().to_peer_id().to_string(),
        10_000,
    );
    cap.role = SpaceRole::Member as i32;
    cap.issuer_cap = Some(issuer_cap);
    sign_membership_capability(&mut cap, &issuer).expect("resign membership");

    let err = verify_membership_capability_with_owner_key(
        &cap,
        &issuer.public(),
        &owner.public(),
        &subject_peer_id,
        SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(30),
    )
    .expect_err("should fail");
    assert!(
        format!("{err}").contains("issuer capability expired"),
        "unexpected error: {err}"
    );
}
