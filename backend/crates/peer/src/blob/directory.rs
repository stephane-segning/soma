//! Tracks which peers this runtime knows about, so [`crate::blob::BlobResolver`]
//! has somewhere to start when a CID isn't available locally.

use async_trait::async_trait;
use libp2p::PeerId;
use std::collections::{HashSet, VecDeque};
use tokio::sync::Mutex;

use crate::PeerEvent;

/// Default number of peers retained per tier before the oldest is evicted.
/// Generous enough for any realistic swarm size while keeping the directory
/// from growing unbounded across a long-running process.
const DEFAULT_TIER_CAPACITY: usize = 256;

/// Supplies candidate peers that might have a given blob, in priority
/// order, and observes peer-runtime events to keep that knowledge current.
///
/// Kept as a trait (rather than hard-coding [`PeerDirectory`] into
/// [`crate::blob::BlobResolver`]) so tests can inject a fixed candidate
/// list without spinning up a real swarm.
#[async_trait]
pub trait CandidatePeerSource: Send + Sync {
    /// Candidate peers to try, in priority order (best first). May be
    /// empty. `space_id`/`cid` are accepted for forward compatibility
    /// (e.g. a future space-scoped directory) but the default
    /// [`PeerDirectory`] implementation ignores them: authorization is
    /// already enforced server-side on fetch (see
    /// `runtime::blob::request::handle_blob_request`'s `SpaceAuthorizer`
    /// check), so an unauthorized candidate merely wastes one attempt
    /// rather than leaking anything.
    async fn candidates(&self, space_id: &str, cid: &str) -> Vec<PeerId>;

    /// Feed a peer-runtime event so the source can update its knowledge.
    /// Must return quickly — no network I/O, no blocking — since it runs
    /// on the peer-event dispatch path.
    async fn observe(&self, event: &PeerEvent);
}

/// Default, in-memory [`CandidatePeerSource`]. Two tiers, best first:
///
/// 1. **Identified** — peers we've completed a libp2p Identify handshake
///    with (`PeerEvent::IdentifyReceived`). Confirmed to speak the Soma
///    agent protocol, and libp2p's `identify::Behaviour` caches their
///    addresses internally, so dialing them later by `PeerId` alone (no
///    explicit `addrs`) just works.
/// 2. **Connected** — any other currently-connected peer
///    (`PeerEvent::ConnectionEstablished`), covering the (normally brief)
///    window before Identify completes, regardless of how the connection
///    was established (mdns, rendezvous discovery, relay circuit, manual
///    dial). Rendezvous- and relay-*discovered* addresses are dialed
///    immediately at discovery time by the swarm task (see
///    `runtime/swarm.rs`), so by the time a candidate is useful it has
///    already become a connected peer — tracking discovery separately
///    would duplicate this tier without adding real candidates.
///
/// Peers are never evicted on disconnect (the resolver's per-candidate
/// timeout already handles a stale/unreachable candidate cheaply); each
/// tier is capacity-bounded FIFO instead, so long-running processes don't
/// grow the directory unboundedly.
pub struct PeerDirectory {
    state: Mutex<DirectoryState>,
}

struct DirectoryState {
    identified: BoundedPeerSet,
    connected: BoundedPeerSet,
}

impl PeerDirectory {
    pub fn new() -> Self {
        Self::with_capacity(DEFAULT_TIER_CAPACITY)
    }

    pub fn with_capacity(tier_capacity: usize) -> Self {
        Self {
            state: Mutex::new(DirectoryState {
                identified: BoundedPeerSet::new(tier_capacity),
                connected: BoundedPeerSet::new(tier_capacity),
            }),
        }
    }
}

impl Default for PeerDirectory {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl CandidatePeerSource for PeerDirectory {
    async fn candidates(&self, _space_id: &str, _cid: &str) -> Vec<PeerId> {
        let state = self.state.lock().await;
        let mut out: Vec<PeerId> = state.identified.iter().copied().collect();
        for peer in state.connected.iter() {
            if !state.identified.contains(peer) {
                out.push(*peer);
            }
        }
        out
    }

    async fn observe(&self, event: &PeerEvent) {
        match event {
            PeerEvent::IdentifyReceived { peer, .. } => {
                self.state.lock().await.identified.insert(*peer);
            }
            PeerEvent::ConnectionEstablished { peer } => {
                self.state.lock().await.connected.insert(*peer);
            }
            _ => {}
        }
    }
}

/// Insertion-ordered, capacity-bounded peer set: oldest evicted first.
struct BoundedPeerSet {
    order: VecDeque<PeerId>,
    set: HashSet<PeerId>,
    capacity: usize,
}

impl BoundedPeerSet {
    fn new(capacity: usize) -> Self {
        Self {
            order: VecDeque::new(),
            set: HashSet::new(),
            capacity: capacity.max(1),
        }
    }

    fn insert(&mut self, peer: PeerId) {
        if self.set.contains(&peer) {
            return;
        }
        if self.order.len() >= self.capacity
            && let Some(oldest) = self.order.pop_front()
        {
            self.set.remove(&oldest);
        }
        self.order.push_back(peer);
        self.set.insert(peer);
    }

    fn contains(&self, peer: &PeerId) -> bool {
        self.set.contains(peer)
    }

    fn iter(&self) -> impl Iterator<Item = &PeerId> {
        self.order.iter()
    }
}
