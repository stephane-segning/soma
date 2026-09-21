use super::*;
use crate::{PeerCommand, PeerEvent};
use async_trait::async_trait;
use libp2p::PeerId;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;

/// A [`CandidatePeerSource`] with a fixed, pre-baked candidate list —
/// stands in for a real [`PeerDirectory`] populated by swarm events.
struct FixedCandidates(Vec<PeerId>);

#[async_trait]
impl CandidatePeerSource for FixedCandidates {
    async fn candidates(&self, _space_id: &str, _cid: &str) -> Vec<PeerId> {
        self.0.clone()
    }

    async fn observe(&self, _event: &PeerEvent) {}
}

fn not_found(space_id: &str, cid: &str) -> PeerEvent {
    PeerEvent::BlobResponseReceived {
        space_id: space_id.to_string(),
        cid: cid.to_string(),
        mime: String::new(),
        size: 0,
        found: false,
        stored: false,
    }
}

fn found_and_stored(space_id: &str, cid: &str) -> PeerEvent {
    PeerEvent::BlobResponseReceived {
        space_id: space_id.to_string(),
        cid: cid.to_string(),
        mime: "text/plain".to_string(),
        size: 3,
        found: true,
        stored: true,
    }
}

fn expect_fetch_blob(cmd: PeerCommand) -> PeerId {
    match cmd {
        PeerCommand::FetchBlob { target, .. } => target,
        other => panic!("expected PeerCommand::FetchBlob, got {other:?}"),
    }
}

#[tokio::test]
async fn resolve_fails_fast_with_no_known_peers() {
    let candidates: Arc<dyn CandidatePeerSource> = Arc::new(FixedCandidates(Vec::new()));
    let (cmd_tx, _cmd_rx) = mpsc::channel(1);
    let resolver = PeerBlobResolver::new(cmd_tx, candidates, BlobResolverConfig::default());

    let err = resolver
        .resolve("space-1", "cid-1")
        .await
        .expect_err("no candidates should fail immediately");

    assert!(matches!(err, BlobResolveError::NoCandidates { .. }));
}

#[tokio::test]
async fn falls_back_to_next_candidate_when_first_reports_not_found() {
    let peer1 = PeerId::random();
    let peer2 = PeerId::random();
    let candidates: Arc<dyn CandidatePeerSource> =
        Arc::new(FixedCandidates(vec![peer1, peer2]));
    let (cmd_tx, mut cmd_rx) = mpsc::channel(8);
    let resolver = Arc::new(PeerBlobResolver::new(
        cmd_tx,
        candidates,
        BlobResolverConfig::default(),
    ));

    let resolver_task = {
        let resolver = resolver.clone();
        tokio::spawn(async move { resolver.resolve("space-1", "cid-1").await })
    };

    let first = cmd_rx.recv().await.expect("first FetchBlob command");
    assert_eq!(expect_fetch_blob(first), peer1);
    resolver.observe(&not_found("space-1", "cid-1")).await;

    let second = cmd_rx.recv().await.expect("second FetchBlob command");
    assert_eq!(expect_fetch_blob(second), peer2);
    resolver.observe(&found_and_stored("space-1", "cid-1")).await;

    let outcome = resolver_task.await.expect("resolver task should not panic");
    assert!(outcome.is_ok(), "expected success once the second candidate serves the blob");
}

#[tokio::test]
async fn all_candidates_failing_returns_a_typed_error() {
    let peer1 = PeerId::random();
    let candidates: Arc<dyn CandidatePeerSource> = Arc::new(FixedCandidates(vec![peer1]));
    let (cmd_tx, mut cmd_rx) = mpsc::channel(8);
    let resolver = Arc::new(PeerBlobResolver::new(
        cmd_tx,
        candidates,
        BlobResolverConfig::default(),
    ));

    let resolver_task = {
        let resolver = resolver.clone();
        tokio::spawn(async move { resolver.resolve("space-1", "cid-1").await })
    };

    let cmd = cmd_rx.recv().await.expect("one FetchBlob command");
    assert_eq!(expect_fetch_blob(cmd), peer1);
    resolver.observe(&not_found("space-1", "cid-1")).await;

    let err = resolver_task
        .await
        .expect("resolver task should not panic")
        .expect_err("no candidate served the blob");
    assert!(matches!(
        err,
        BlobResolveError::AllCandidatesFailed { tried: 1, .. }
    ));
}

#[tokio::test]
async fn concurrent_resolves_for_the_same_key_share_one_network_fetch() {
    let peer1 = PeerId::random();
    let candidates: Arc<dyn CandidatePeerSource> = Arc::new(FixedCandidates(vec![peer1]));
    let (cmd_tx, mut cmd_rx) = mpsc::channel(8);
    let resolver = Arc::new(PeerBlobResolver::new(
        cmd_tx,
        candidates,
        BlobResolverConfig::default(),
    ));

    let leader = {
        let resolver = resolver.clone();
        tokio::spawn(async move { resolver.resolve("space-1", "cid-1").await })
    };
    let cmd = cmd_rx.recv().await.expect("leader sends one FetchBlob command");
    assert_eq!(expect_fetch_blob(cmd), peer1);

    // Join as a follower on the same in-flight key. A short real wait lets
    // the spawned task actually run up to its subscribe point before we
    // deliver the outcome below — not asserting on timing, just yielding.
    let follower = {
        let resolver = resolver.clone();
        tokio::spawn(async move { resolver.resolve("space-1", "cid-1").await })
    };
    tokio::time::sleep(Duration::from_millis(20)).await;

    resolver.observe(&found_and_stored("space-1", "cid-1")).await;

    let (leader_outcome, follower_outcome) = tokio::join!(leader, follower);
    assert!(leader_outcome.expect("no panic").is_ok());
    assert!(follower_outcome.expect("no panic").is_ok());

    assert!(
        cmd_rx.try_recv().is_err(),
        "a second concurrent caller for the same key must not trigger a second network fetch"
    );
}

#[tokio::test(start_paused = true)]
async fn a_candidate_that_never_answers_times_out_and_the_next_is_tried() {
    let peer1 = PeerId::random();
    let peer2 = PeerId::random();
    let candidates: Arc<dyn CandidatePeerSource> =
        Arc::new(FixedCandidates(vec![peer1, peer2]));
    let (cmd_tx, mut cmd_rx) = mpsc::channel(8);
    let config = BlobResolverConfig {
        per_candidate_timeout: Duration::from_secs(1),
        overall_timeout: Duration::from_secs(30),
        max_candidates: 5,
    };
    let resolver = Arc::new(PeerBlobResolver::new(cmd_tx, candidates, config));

    let resolver_task = {
        let resolver = resolver.clone();
        tokio::spawn(async move { resolver.resolve("space-1", "cid-1").await })
    };

    let first = cmd_rx.recv().await.expect("first FetchBlob command");
    assert_eq!(expect_fetch_blob(first), peer1);

    // Nobody ever answers for peer1: advance virtual time past its
    // per-candidate timeout without sending any outcome.
    tokio::time::advance(Duration::from_secs(2)).await;

    let second = cmd_rx.recv().await.expect("second FetchBlob command after timeout");
    assert_eq!(expect_fetch_blob(second), peer2);
    resolver.observe(&found_and_stored("space-1", "cid-1")).await;

    let outcome = resolver_task.await.expect("resolver task should not panic");
    assert!(outcome.is_ok());
}

#[tokio::test]
async fn directory_prefers_identified_peers_over_merely_connected_ones() {
    let directory = PeerDirectory::new();
    let identified = PeerId::random();
    let connected_only = PeerId::random();

    // Observed out of "priority" order on purpose: connected_only arrives
    // (and is identified-tier-absent) before `identified` completes
    // Identify, to prove ordering comes from tier, not observation order.
    directory
        .observe(&PeerEvent::ConnectionEstablished {
            peer: connected_only,
        })
        .await;
    directory
        .observe(&PeerEvent::ConnectionEstablished { peer: identified })
        .await;
    directory
        .observe(&PeerEvent::IdentifyReceived {
            peer: identified,
            agent: String::new(),
            protocols: 0,
            public_key: None,
        })
        .await;

    let candidates = directory.candidates("space-1", "cid-1").await;
    assert_eq!(candidates, vec![identified, connected_only]);
}

#[tokio::test]
async fn directory_returns_no_candidates_when_nothing_observed() {
    let directory = PeerDirectory::new();
    assert!(directory.candidates("space-1", "cid-1").await.is_empty());
}
