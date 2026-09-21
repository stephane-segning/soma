//! Two-peer document replication, driven end to end against real
//! SQLite stores.
//!
//! These tests stand up *two independent databases* and hand messages
//! between two `StorageDocumentSync` instances by calling the same
//! methods the swarm calls. That deliberately covers everything except
//! the libp2p hop: authorization, digest comparison, the
//! last-writer-wins rule, page attachment, and the property that the
//! exchange terminates. The network hop itself is verified by running
//! two real daemons — see `planning/` for that pass.
//!
//! Before this existed the repository had no multi-peer test of any
//! kind, which is precisely why "documents never replicate" survived a
//! green suite.

use std::sync::Arc;

use libp2p::PeerId;
use soma_peer::{DocumentSyncProvider, DocumentSyncRequest};
use soma_storage::RepositoryProvider;
use soma_storage::documents::Document;
use soma_storage::membership::{Space, SpaceMembership};
use soma_storage::pages::Page;
use tokio::sync::broadcast;

use super::StorageDocumentSync;

static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../storage/migrations");

const SPACE: &str = "space-1";
const DOC: &str = "doc-1";

/// One peer: its own database, its own provider.
struct Node {
    _dir: tempfile::TempDir,
    repos: Arc<dyn RepositoryProvider>,
    provider: StorageDocumentSync,
    peer_id: PeerId,
}

async fn node(name: &str) -> Node {
    let dir = tempfile::tempdir().expect("tempdir");
    let url = format!("sqlite://{}", dir.path().join(format!("{name}.db")).display());
    let factory = soma_storage::bootstrap::connect_any(&url, &MIGRATOR)
        .await
        .expect("connect test db");
    let repos: Arc<dyn RepositoryProvider> = Arc::new(factory);
    let (events, _rx) = broadcast::channel(16);
    Node {
        _dir: dir,
        provider: StorageDocumentSync::new(repos.clone(), events),
        repos,
        peer_id: PeerId::random(),
    }
}

/// Give `node` a space owned by `members[0]` plus membership rows for
/// everyone in `members`.
async fn seed_space(node: &Node, members: &[PeerId]) {
    seed_space_owned_by(node, members[0], members).await
}

/// Same, but the owner is named separately — which is how a joiner
/// actually looks: it pins the owner it joined through while holding a
/// membership row only for itself.
///
/// `upsert_space` guards the owner column, so the owner must be correct
/// on the first write; a later correction is silently ignored.
async fn seed_space_owned_by(node: &Node, owner: PeerId, members: &[PeerId]) {
    node.repos
        .membership_repo()
        .upsert_space(&Space {
            space_id: SPACE.to_string(),
            display_name: Some("Space".to_string()),
            owner_peer_id: Some(owner.to_string()),
            created_at: 0,
        })
        .await
        .expect("upsert space");
    for m in members {
        node.repos
            .membership_repo()
            .upsert_membership(&SpaceMembership {
                space_id: SPACE.to_string(),
                subject_peer_id: m.to_string(),
                role: "editor".to_string(),
                issuer_peer_id: owner.to_string(),
                issued_at: 0,
                expires_at: None,
                capability: None,
            })
            .await
            .expect("upsert membership");
    }
}

async fn write_doc(node: &Node, body: &str, updated_at_ms: i64, origin: &PeerId) {
    node.repos
        .document_repo()
        .upsert_document(&Document {
            space_id: SPACE.to_string(),
            document_id: DOC.to_string(),
            content_json: format!(r#"{{"type":"doc","body":"{body}"}}"#),
            published: true,
            updated_at_ms,
            origin_peer_id: origin.to_string(),
        })
        .await
        .expect("write doc");
    node.repos
        .page_repo()
        .create_page(&Page {
            space_id: SPACE.to_string(),
            page_id: DOC.to_string(),
            title: format!("Title {body}"),
            parent_page_ids: vec![],
            created_at_ms: updated_at_ms,
            updated_at_ms,
        })
        .await
        .expect("write page");
}

async fn content_of(node: &Node) -> Option<String> {
    node.repos
        .document_repo()
        .get_document(SPACE, DOC)
        .await
        .expect("read")
        .map(|d| d.content_json)
}

/// Run the full exchange from `a` (offerer) to `b`, exactly as the
/// runtime would: offer -> response -> follow-up -> final response.
/// Returns the number of messages exchanged, so a test can assert the
/// conversation actually ended.
async fn run_exchange(a: &Node, b: &Node) -> usize {
    let have = a
        .repos
        .document_repo()
        .list_document_digests(SPACE)
        .await
        .expect("digests")
        .into_iter()
        .map(|d| soma_peer::DocumentDigest {
            document_id: d.document_id,
            updated_at_ms: d.updated_at_ms,
            origin_peer_id: d.origin_peer_id,
            published: d.published,
        })
        .collect();

    let offer = DocumentSyncRequest {
        space_id: SPACE.to_string(),
        have,
        want: Vec::new(),
        documents: Vec::new(),
    };

    let mut messages = 1;
    let mut response = b.provider.handle_request(&a.peer_id, offer).await;
    assert!(response.authorized, "b refused an authorized member");
    messages += 1;

    // Bounded on purpose: if the protocol ever fails to terminate this
    // trips instead of hanging the suite.
    for _ in 0..8 {
        let Some(next) = a
            .provider
            .on_response(&b.peer_id, SPACE, response.clone())
            .await
        else {
            return messages;
        };
        messages += 1;
        response = b.provider.handle_request(&a.peer_id, next).await;
        messages += 1;
    }
    panic!("exchange did not terminate after {messages} messages");
}

#[tokio::test]
async fn replicates_a_document_and_its_page_to_a_member() {
    let a = node("a").await;
    let b = node("b").await;
    seed_space(&a, &[a.peer_id, b.peer_id]).await;
    seed_space(&b, &[a.peer_id, b.peer_id]).await;
    write_doc(&a, "hello", 1_000, &a.peer_id).await;

    assert_eq!(content_of(&b).await, None, "b should start empty");
    run_exchange(&a, &b).await;

    let got = content_of(&b).await.expect("b did not receive the document");
    assert!(got.contains("hello"), "unexpected content: {got}");

    // The page must travel too, or the document is unreachable in the UI.
    let page = b
        .repos
        .page_repo()
        .get_page(SPACE, DOC)
        .await
        .expect("read page")
        .expect("b did not receive the page");
    assert_eq!(page.title, "Title hello");
}

#[tokio::test]
async fn exchange_terminates() {
    let a = node("a").await;
    let b = node("b").await;
    seed_space(&a, &[a.peer_id, b.peer_id]).await;
    seed_space(&b, &[a.peer_id, b.peer_id]).await;
    write_doc(&a, "hello", 1_000, &a.peer_id).await;

    // `run_exchange` panics if it does not end; assert the count is
    // small so a silently-growing conversation is also a failure.
    let messages = run_exchange(&a, &b).await;
    assert!(messages <= 4, "took {messages} messages, expected <= 4");
}

#[tokio::test]
async fn syncs_both_directions_in_one_exchange() {
    let a = node("a").await;
    let b = node("b").await;
    seed_space(&a, &[a.peer_id, b.peer_id]).await;
    seed_space(&b, &[a.peer_id, b.peer_id]).await;

    // Each side holds a document the other has never seen.
    write_doc(&a, "from-a", 1_000, &a.peer_id).await;
    b.repos
        .document_repo()
        .upsert_document(&Document {
            space_id: SPACE.to_string(),
            document_id: "doc-b".to_string(),
            content_json: r#"{"type":"doc","body":"from-b"}"#.to_string(),
            published: true,
            updated_at_ms: 1_000,
            origin_peer_id: b.peer_id.to_string(),
        })
        .await
        .expect("write b doc");

    run_exchange(&a, &b).await;

    assert!(
        content_of(&b).await.is_some_and(|c| c.contains("from-a")),
        "a's document did not reach b"
    );
    let a_got = a
        .repos
        .document_repo()
        .get_document(SPACE, "doc-b")
        .await
        .expect("read");
    assert!(
        a_got.is_some_and(|d| d.content_json.contains("from-b")),
        "b's document did not reach a — the exchange is not symmetric"
    );
}

#[tokio::test]
async fn refuses_a_non_member_without_leaking_anything() {
    let a = node("a").await;
    let b = node("b").await;
    // b knows the space but a is NOT a member of it on b's side.
    seed_space(&b, &[b.peer_id]).await;
    write_doc(&b, "secret", 1_000, &b.peer_id).await;

    let response = b
        .provider
        .handle_request(
            &a.peer_id,
            DocumentSyncRequest {
                space_id: SPACE.to_string(),
                have: Vec::new(),
                want: vec![DOC.to_string()],
                documents: Vec::new(),
            },
        )
        .await;

    assert!(!response.authorized);
    assert!(response.documents.is_empty(), "leaked document content");
    assert!(
        response.have.is_empty(),
        "leaked the document roster of a space the caller cannot read"
    );
    assert!(response.want.is_empty());
}

/// Regression for the first two-daemon run: replication was wired
/// correctly end to end and still moved nothing, because a peer that
/// joins by invite records only its own membership. The joiner's roster
/// never contains the owner, so it refused the one peer it most needed
/// to talk to. Only a real two-node run surfaced this — every
/// single-process test had seeded both rosters by hand.
#[tokio::test]
async fn the_owner_is_authorized_even_without_a_local_membership_row() {
    let owner = node("owner").await;
    let joiner = node("joiner").await;

    // The owner knows everyone; the joiner knows only itself, exactly
    // as `invites_redeem` leaves it.
    seed_space(&owner, &[owner.peer_id, joiner.peer_id]).await;
    seed_space_owned_by(&joiner, owner.peer_id, &[joiner.peer_id]).await;

    write_doc(&owner, "hello", 1_000, &owner.peer_id).await;
    run_exchange(&owner, &joiner).await;

    assert!(
        content_of(&joiner).await.is_some_and(|c| c.contains("hello")),
        "the owner was refused by a peer that had just joined its space"
    );
}

/// The flip side: being able to name yourself owner is not enough —
/// the check reads the *pinned* owner, not anything the caller says.
#[tokio::test]
async fn a_stranger_claiming_the_space_is_still_refused() {
    let stranger = node("stranger").await;
    let holder = node("holder").await;
    seed_space(&holder, &[holder.peer_id]).await;
    write_doc(&holder, "secret", 1_000, &holder.peer_id).await;

    let response = holder
        .provider
        .handle_request(
            &stranger.peer_id,
            DocumentSyncRequest {
                space_id: SPACE.to_string(),
                have: Vec::new(),
                want: vec![DOC.to_string()],
                documents: Vec::new(),
            },
        )
        .await;

    assert!(!response.authorized);
    assert!(response.documents.is_empty());
    assert!(response.have.is_empty());
}

#[tokio::test]
async fn drops_documents_that_were_never_requested() {
    let a = node("a").await;
    let b = node("b").await;
    seed_space(&a, &[a.peer_id, b.peer_id]).await;
    seed_space(&b, &[a.peer_id, b.peer_id]).await;

    // A member sends a document b never asked for, in a request that
    // advertises nothing. Being authorized is not enough to write.
    let unsolicited = soma_peer::DocumentPayload {
        document_id: DOC.to_string(),
        content_json: r#"{"type":"doc","body":"injected"}"#.to_string(),
        updated_at_ms: 9_999,
        origin_peer_id: a.peer_id.to_string(),
        published: true,
        title: "Injected".to_string(),
        parent_page_ids: vec![],
    };
    let response = b
        .provider
        .handle_request(
            &a.peer_id,
            DocumentSyncRequest {
                space_id: SPACE.to_string(),
                have: Vec::new(),
                want: Vec::new(),
                documents: vec![unsolicited],
            },
        )
        .await;

    assert!(response.authorized);
    assert_eq!(
        content_of(&b).await,
        None,
        "an unsolicited document was written"
    );
}

#[tokio::test]
async fn an_older_version_loses_and_leaves_the_page_alone() {
    let a = node("a").await;
    let b = node("b").await;
    seed_space(&a, &[a.peer_id, b.peer_id]).await;
    seed_space(&b, &[a.peer_id, b.peer_id]).await;

    // b already holds a newer version than a is about to offer.
    write_doc(&a, "old", 1_000, &a.peer_id).await;
    write_doc(&b, "new", 2_000, &b.peer_id).await;

    run_exchange(&a, &b).await;

    let kept = content_of(&b).await.expect("b lost its document");
    assert!(kept.contains("new"), "older version overwrote newer: {kept}");
    let page = b
        .repos
        .page_repo()
        .get_page(SPACE, DOC)
        .await
        .expect("read page")
        .expect("page vanished");
    assert_eq!(
        page.title, "Title new",
        "a losing version renamed the page"
    );

    // ...and the exchange should have carried a's copy the other way,
    // because a *is* behind.
    let a_now = content_of(&a).await.expect("a lost its document");
    assert!(
        a_now.contains("new"),
        "a did not converge onto the winning version: {a_now}"
    );
}

#[tokio::test]
async fn same_timestamp_resolves_identically_on_both_sides() {
    let a = node("a").await;
    let b = node("b").await;
    seed_space(&a, &[a.peer_id, b.peer_id]).await;
    seed_space(&b, &[a.peer_id, b.peer_id]).await;

    // Same millisecond, different origins — the tiebreaker decides, and
    // it must decide the same way from either side.
    write_doc(&a, "from-a", 5_000, &a.peer_id).await;
    write_doc(&b, "from-b", 5_000, &b.peer_id).await;

    let expected_winner = if a.peer_id.to_string() > b.peer_id.to_string() {
        "from-a"
    } else {
        "from-b"
    };

    run_exchange(&a, &b).await;

    let a_final = content_of(&a).await.expect("a empty");
    let b_final = content_of(&b).await.expect("b empty");
    assert_eq!(a_final, b_final, "peers did not converge");
    assert!(
        a_final.contains(expected_winner),
        "expected {expected_winner} to win, got {a_final}"
    );
}
