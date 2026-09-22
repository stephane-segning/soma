//! Roster serving and ingestion against a real SQLite store.
//!
//! The signature rules themselves are pinned in
//! `soma_membership::roster`; what is tested here is the daemon's half:
//! who is allowed to *ask* for a roster, and that ingestion actually
//! persists what verifies and nothing else.

use std::sync::Arc;

use libp2p::identity::Keypair;
use prost::Message;
use prost_types::Timestamp;
use soma_peer::RosterProvider;
use soma_proto_build::space::{self, MembershipCapability, SpaceId, SpaceRole};
use soma_storage::RepositoryProvider;
use soma_storage::membership::{Space, SpaceMembership};

use super::StorageRosterSync;

static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../storage/migrations");

const SPACE: &str = "space-1";

struct Node {
    _dir: tempfile::TempDir,
    repos: Arc<dyn RepositoryProvider>,
    provider: StorageRosterSync,
    peer_id: PeerId,
}

use libp2p::PeerId;

async fn node(name: &str, keypair: &Keypair) -> Node {
    let dir = tempfile::tempdir().expect("tempdir");
    let url = format!(
        "sqlite://{}",
        dir.path().join(format!("{name}.db")).display()
    );
    let factory = soma_storage::bootstrap::connect_any(&url, &MIGRATOR)
        .await
        .expect("connect test db");
    let repos: Arc<dyn RepositoryProvider> = Arc::new(factory);
    let peer_id = keypair.public().to_peer_id();
    Node {
        _dir: dir,
        provider: StorageRosterSync::new(repos.clone(), peer_id, keypair.public()),
        repos,
        peer_id,
    }
}

fn now_ts() -> Timestamp {
    Timestamp {
        seconds: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64,
        nanos: 0,
    }
}

fn signed_capability(subject: &PeerId, signer: &Keypair) -> MembershipCapability {
    let mut cap = MembershipCapability {
        space_id: Some(SpaceId {
            value: SPACE.into(),
        }),
        subject_peer_id: Some(space::PeerId {
            value: subject.to_string(),
        }),
        role: SpaceRole::Member as i32,
        permissions: Vec::new(),
        issued_at: Some(now_ts()),
        expires_at: None,
        issuer_peer_id: Some(space::PeerId {
            value: signer.public().to_peer_id().to_string(),
        }),
        issuer_cap: None,
        signed: None,
    };
    soma_common::sign_membership_capability(&mut cap, signer).expect("sign");
    cap
}

/// Seed `node` with the space (owned by `owner`) and a membership row
/// for each of `members`, each carrying an owner-signed capability.
async fn seed(node: &Node, owner_kp: &Keypair, members: &[PeerId]) {
    let owner = owner_kp.public().to_peer_id();
    node.repos
        .membership_repo()
        .upsert_space(&Space {
            space_id: SPACE.to_string(),
            display_name: Some("Space".into()),
            owner_peer_id: Some(owner.to_string()),
            created_at: 0,
        })
        .await
        .expect("space");
    for m in members {
        let cap = signed_capability(m, owner_kp);
        node.repos
            .membership_repo()
            .upsert_membership(&SpaceMembership {
                space_id: SPACE.to_string(),
                subject_peer_id: m.to_string(),
                role: "member".into(),
                issuer_peer_id: owner.to_string(),
                issued_at: 0,
                expires_at: None,
                capability: Some(cap.encode_to_vec()),
            })
            .await
            .expect("membership");
    }
}

#[tokio::test]
async fn serves_the_roster_to_a_member_and_refuses_a_stranger() {
    let owner_kp = Keypair::generate_ed25519();
    let owner = node("owner", &owner_kp).await;
    let member = PeerId::random();
    let stranger = PeerId::random();
    seed(&owner, &owner_kp, &[owner.peer_id, member]).await;

    let served = owner
        .provider
        .roster_for(&member, SPACE)
        .await
        .expect("a member must be served");
    assert_eq!(served.len(), 2, "expected both rows");

    assert!(
        owner.provider.roster_for(&stranger, SPACE).await.is_none(),
        "a stranger must be refused, and a refusal is not an empty roster"
    );
}

#[tokio::test]
async fn a_member_learns_the_rest_of_the_roster_and_can_then_authorize_them() {
    let owner_kp = Keypair::generate_ed25519();
    let owner = node("owner", &owner_kp).await;
    let m1_kp = Keypair::generate_ed25519();
    let m1 = node("m1", &m1_kp).await;
    let m2 = PeerId::random();

    seed(&owner, &owner_kp, &[owner.peer_id, m1.peer_id, m2]).await;
    // The joiner's real starting state: itself, and a pinned owner.
    seed(&m1, &owner_kp, &[m1.peer_id]).await;
    // It has Identify'd the owner — that is how it joined.
    m1.repos
        .peer_keys_repo()
        .upsert(
            &owner.peer_id.to_string(),
            &owner_kp.public().encode_protobuf(),
            0,
        )
        .await
        .expect("store owner key");

    assert_eq!(
        crate::space_peers(m1.repos.as_ref(), SPACE, &m1.peer_id).await,
        vec![owner.peer_id],
        "before ingest a joiner knows only the owner"
    );

    let rows = owner
        .provider
        .roster_for(&m1.peer_id, SPACE)
        .await
        .expect("owner serves its member");
    let learned = m1.provider.ingest_roster(&owner.peer_id, SPACE, rows).await;

    assert!(
        learned.contains(&m2),
        "m1 should have learned about m2, learned={learned:?}"
    );
    let peers = crate::space_peers(m1.repos.as_ref(), SPACE, &m1.peer_id).await;
    assert!(
        peers.contains(&m2),
        "m1 must now be able to authorize m2, peers={peers:?}"
    );
}

/// The forgery that matters: a member relaying rows it signed itself.
#[tokio::test]
async fn rejects_rows_forged_by_the_relaying_peer() {
    let owner_kp = Keypair::generate_ed25519();
    let attacker_kp = Keypair::generate_ed25519();
    let attacker = attacker_kp.public().to_peer_id();
    let m1_kp = Keypair::generate_ed25519();
    let m1 = node("m1", &m1_kp).await;
    let victim = PeerId::random();

    seed(&m1, &owner_kp, &[m1.peer_id]).await;
    // Both keys are known — being known is not being authorized.
    for (peer, kp) in [
        (owner_kp.public().to_peer_id(), &owner_kp),
        (attacker, &attacker_kp),
    ] {
        m1.repos
            .peer_keys_repo()
            .upsert(&peer.to_string(), &kp.public().encode_protobuf(), 0)
            .await
            .expect("store key");
    }

    let forged = signed_capability(&victim, &attacker_kp).encode_to_vec();
    let learned = m1
        .provider
        .ingest_roster(&attacker, SPACE, vec![forged])
        .await;

    assert!(learned.is_empty(), "a self-signed row must not be learned");
    let peers = crate::space_peers(m1.repos.as_ref(), SPACE, &m1.peer_id).await;
    assert!(
        !peers.contains(&victim),
        "a forged row must not make a peer authorizable"
    );
}

/// An oversized roster is refused wholesale rather than verified row by
/// row — otherwise a peer can make us do unbounded signature work.
#[tokio::test]
async fn refuses_an_implausibly_large_roster_without_verifying_it() {
    let owner_kp = Keypair::generate_ed25519();
    let m1_kp = Keypair::generate_ed25519();
    let m1 = node("m1", &m1_kp).await;
    seed(&m1, &owner_kp, &[m1.peer_id]).await;

    let one = signed_capability(&PeerId::random(), &owner_kp).encode_to_vec();
    let flood = vec![one; super::MAX_ROSTER_ENTRIES + 1];
    let learned = m1
        .provider
        .ingest_roster(&owner_kp.public().to_peer_id(), SPACE, flood)
        .await;

    assert!(learned.is_empty(), "an oversized roster must be dropped");
}
