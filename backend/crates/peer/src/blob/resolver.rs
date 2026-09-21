//! Resolves a `(space_id, cid)` pair to verified local bytes by asking
//! candidate peers over the network, one at a time, until one serves it.
//!
//! This is the piece that makes `soma-blob://` work for content created on
//! *another* device: `DaemonHandle::read_blob` calls
//! [`BlobResolver::resolve`] on a local miss, then re-reads from disk.

use async_trait::async_trait;
use libp2p::PeerId;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, broadcast, mpsc};
use tracing::debug;

use crate::PeerCommand;
use crate::PeerEvent;
use crate::blob::directory::{CandidatePeerSource, PeerDirectory};

/// A `(space_id, cid)` fetch that failed to resolve over the network.
/// `Clone` because the outcome is fanned out to every caller that joined
/// the same in-flight attempt (see [`PeerBlobResolver`]'s single-flight
/// behavior).
#[derive(Debug, Clone, thiserror::Error)]
pub enum BlobResolveError {
    #[error("no known peers to fetch {space_id}/{cid} from")]
    NoCandidates { space_id: String, cid: String },
    #[error("tried {tried} candidate peer(s) without finding {space_id}/{cid}")]
    AllCandidatesFailed {
        space_id: String,
        cid: String,
        tried: usize,
    },
    #[error("timed out resolving {space_id}/{cid} over the network")]
    Timeout { space_id: String, cid: String },
}

/// Given `(space_id, cid)`, fetches verified bytes from any peer that has
/// them and persists them locally (via the same [`soma_vdfs::BlobProvider`]
/// the peer runtime already writes network-verified bytes through).
/// `resolve` doesn't return bytes itself — callers re-read their local
/// store afterward, keeping the local-hit fast path in
/// `DaemonHandle::read_blob` completely unchanged.
#[async_trait]
pub trait BlobResolver: Send + Sync {
    async fn resolve(&self, space_id: &str, cid: &str) -> Result<(), BlobResolveError>;

    /// Feed a peer-runtime event. Register a
    /// [`crate::blob::BlobResolverBridge`] wrapping this resolver as a
    /// `PeerEventHandler` so the dispatcher calls this automatically;
    /// nothing else needs to call it directly.
    async fn observe(&self, event: &PeerEvent);
}

#[derive(Debug, Clone, Copy)]
pub struct BlobResolverConfig {
    /// How long to wait for one candidate to answer before moving on.
    pub per_candidate_timeout: Duration,
    /// Ceiling on the whole `resolve()` call, across every candidate tried.
    pub overall_timeout: Duration,
    /// Upper bound on how many candidates a single `resolve()` will try.
    pub max_candidates: usize,
}

impl Default for BlobResolverConfig {
    fn default() -> Self {
        Self {
            per_candidate_timeout: Duration::from_secs(30),
            overall_timeout: Duration::from_secs(120),
            max_candidates: 5,
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct AttemptOutcome {
    found: bool,
    stored: bool,
}

type FetchKey = (String, String);

struct InFlight {
    attempt_tx: mpsc::Sender<AttemptOutcome>,
    final_tx: broadcast::Sender<Result<(), BlobResolveError>>,
}

/// Default [`BlobResolver`]: tries [`CandidatePeerSource`] candidates in
/// order via [`PeerCommand::FetchBlob`], and single-flights concurrent
/// callers for the same key so N simultaneous readers cause one network
/// fetch.
///
/// Correlation with the peer runtime's response is best-effort by
/// `(space_id, cid)` — `PeerEvent::BlobResponseReceived` doesn't carry a
/// request id (the runtime that emits it, `runtime/blob/response.rs`, is
/// the "verified working, do not rewrite" side of this task). Two things
/// make that safe rather than merely convenient:
///
/// - Content addressing: any `stored: true` response for a given CID is,
///   by construction, verified-correct bytes for that CID — it doesn't
///   matter whether it's attributed to the candidate we most recently
///   asked, a race can never produce a *wrong* success.
/// - Before each new candidate attempt, [`PeerBlobResolver`] drains any
///   stale outcome left over from a previous (already-timed-out)
///   candidate in the same loop, so a late response can't be misread as
///   the new candidate's answer. The residual risk — a late response
///   arriving in the brief window between the drain and the new request
///   landing — can only cause an extra candidate to be tried, never an
///   incorrect result.
pub struct PeerBlobResolver {
    commands: mpsc::Sender<PeerCommand>,
    candidates: Arc<dyn CandidatePeerSource>,
    config: BlobResolverConfig,
    inflight: Mutex<HashMap<FetchKey, InFlight>>,
}

impl PeerBlobResolver {
    pub fn new(
        commands: mpsc::Sender<PeerCommand>,
        candidates: Arc<dyn CandidatePeerSource>,
        config: BlobResolverConfig,
    ) -> Self {
        Self {
            commands,
            candidates,
            config,
            inflight: Mutex::new(HashMap::new()),
        }
    }

    /// Convenience constructor wired to a fresh, default [`PeerDirectory`].
    pub fn with_default_directory(
        commands: mpsc::Sender<PeerCommand>,
        config: BlobResolverConfig,
    ) -> Self {
        Self::new(commands, Arc::new(PeerDirectory::new()), config)
    }

    async fn run_candidates(
        &self,
        space_id: &str,
        cid: &str,
        mut attempt_rx: mpsc::Receiver<AttemptOutcome>,
    ) -> Result<(), BlobResolveError> {
        let candidates: Vec<PeerId> = self
            .candidates
            .candidates(space_id, cid)
            .await
            .into_iter()
            .take(self.config.max_candidates)
            .collect();

        if candidates.is_empty() {
            return Err(BlobResolveError::NoCandidates {
                space_id: space_id.to_string(),
                cid: cid.to_string(),
            });
        }

        let tried = candidates.len();
        for target in candidates {
            // Discard any outcome left over from a previous candidate's
            // timed-out attempt in this same loop (see struct docs).
            while attempt_rx.try_recv().is_ok() {}

            let sent = self
                .commands
                .send(PeerCommand::FetchBlob {
                    target,
                    addrs: Vec::new(),
                    cid: cid.to_string(),
                    space_id: Some(space_id.to_string()),
                })
                .await;
            if sent.is_err() {
                debug!(%target, %space_id, %cid, "peer runtime gone, aborting resolve");
                break;
            }

            match tokio::time::timeout(self.config.per_candidate_timeout, attempt_rx.recv()).await
            {
                Ok(Some(outcome)) if outcome.found && outcome.stored => return Ok(()),
                Ok(Some(_outcome)) => {
                    debug!(%target, %space_id, %cid, "candidate did not have blob, trying next");
                }
                Ok(None) => {
                    debug!(%target, %space_id, %cid, "resolver event channel closed");
                    break;
                }
                Err(_elapsed) => {
                    debug!(%target, %space_id, %cid, "candidate timed out, trying next");
                }
            }
        }

        Err(BlobResolveError::AllCandidatesFailed {
            space_id: space_id.to_string(),
            cid: cid.to_string(),
            tried,
        })
    }

    async fn complete_attempt(&self, space_id: &str, cid: &str, found: bool, stored: bool) {
        let inflight = self.inflight.lock().await;
        if let Some(entry) = inflight.get(&(space_id.to_string(), cid.to_string())) {
            let _ = entry.attempt_tx.try_send(AttemptOutcome { found, stored });
        }
    }
}

#[async_trait]
impl BlobResolver for PeerBlobResolver {
    async fn resolve(&self, space_id: &str, cid: &str) -> Result<(), BlobResolveError> {
        let key: FetchKey = (space_id.to_string(), cid.to_string());

        let mut final_rx = {
            let mut inflight = self.inflight.lock().await;
            match inflight.get(&key) {
                Some(entry) => entry.final_tx.subscribe(),
                None => {
                    let (final_tx, _no_local_subscriber) = broadcast::channel(1);
                    let (attempt_tx, attempt_rx) = mpsc::channel(4);
                    inflight.insert(
                        key.clone(),
                        InFlight {
                            attempt_tx,
                            final_tx: final_tx.clone(),
                        },
                    );
                    drop(inflight);

                    // Leader path: drive the candidate loop ourselves,
                    // under the resolver's overall timeout, then publish
                    // the outcome to any followers that joined meanwhile.
                    let outcome = tokio::time::timeout(
                        self.config.overall_timeout,
                        self.run_candidates(space_id, cid, attempt_rx),
                    )
                    .await
                    .unwrap_or_else(|_elapsed| {
                        Err(BlobResolveError::Timeout {
                            space_id: space_id.to_string(),
                            cid: cid.to_string(),
                        })
                    });

                    self.inflight.lock().await.remove(&key);
                    let _ = final_tx.send(outcome.clone());
                    return outcome;
                }
            }
        };

        // Follower path: wait for the leader's outcome, bounded by our own
        // overall timeout in case the leader's broadcast is somehow lost.
        match tokio::time::timeout(self.config.overall_timeout, final_rx.recv()).await {
            Ok(Ok(outcome)) => outcome,
            Ok(Err(_lagged_or_closed)) => Err(BlobResolveError::AllCandidatesFailed {
                space_id: space_id.to_string(),
                cid: cid.to_string(),
                tried: 0,
            }),
            Err(_elapsed) => Err(BlobResolveError::Timeout {
                space_id: space_id.to_string(),
                cid: cid.to_string(),
            }),
        }
    }

    async fn observe(&self, event: &PeerEvent) {
        self.candidates.observe(event).await;
        if let PeerEvent::BlobResponseReceived {
            space_id,
            cid,
            found,
            stored,
            ..
        } = event
        {
            self.complete_attempt(space_id, cid, *found, *stored).await;
        }
    }
}
