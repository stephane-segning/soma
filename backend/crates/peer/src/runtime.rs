mod blob;
mod command;
mod issuer;
mod join;
mod swarm;

use crate::behaviour::AppBehaviour;
use crate::join::JoinDecider;
use crate::{PeerCommand, PeerEvent, SpaceAuthorizer};
use futures::StreamExt;
use libp2p::{Multiaddr, PeerId, multiaddr::Protocol, request_response as reqres};
use soma_core::SomaResult;
use soma_vdfs::{BlobProvider, BlobWriteStream};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::mpsc;

pub(crate) struct BlobDownloadState {
    pub(crate) writer: Box<dyn BlobWriteStream>,
    pub(crate) total_size: u64,
    pub(crate) next_offset: u64,
    pub(crate) chunk_size: u32,
}

pub(crate) struct RuntimeState {
    pub(crate) peer_id: PeerId,
    pub(crate) rendezvous_namespace: String,
    pub(crate) rendezvous_peers: HashSet<PeerId>,
    pub(crate) relay_peers: HashMap<PeerId, Multiaddr>,
    pub(crate) requested_reservations: HashSet<PeerId>,
    pub(crate) outbound_join_requests: HashMap<reqres::OutboundRequestId, (PeerId, String, String)>,
    pub(crate) outbound_join_decisions: HashMap<reqres::OutboundRequestId, (PeerId, String)>,
    /// Outstanding issuer offers, keyed by libp2p request id. Tuple is
    /// `(target_peer, delivery_id, space_id)` — the delivery_id is the
    /// daemon's per-issuance correlation id, used so the resulting
    /// ack/failed event can be tied back to the persistent bot row.
    pub(crate) outbound_issuer_offers:
        HashMap<reqres::OutboundRequestId, (PeerId, String, String)>,
    pub(crate) blob_downloads: HashMap<(String, String), BlobDownloadState>,
    pub(crate) join_decider: Arc<dyn JoinDecider>,
    pub(crate) swarm: libp2p::Swarm<AppBehaviour>,
    pub(crate) event_tx: mpsc::Sender<PeerEvent>,
    pub(crate) blob_provider: Option<Arc<dyn BlobProvider>>,
    pub(crate) space_authorizer: Option<Arc<dyn SpaceAuthorizer>>,
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn run_swarm(
    peer_id: PeerId,
    rendezvous_namespace: String,
    relay_addrs: Vec<Multiaddr>,
    rendezvous_peers: HashSet<PeerId>,
    mut relay_peers: HashMap<PeerId, Multiaddr>,
    join_decider: Arc<dyn JoinDecider>,
    mut swarm: libp2p::Swarm<AppBehaviour>,
    mut command_rx: mpsc::Receiver<PeerCommand>,
    event_tx: mpsc::Sender<PeerEvent>,
    blob_provider: Option<Arc<dyn BlobProvider>>,
    space_authorizer: Option<Arc<dyn SpaceAuthorizer>>,
) -> SomaResult<()> {
    for addr in relay_addrs {
        if let Some(peer_id) = extract_peer_id(&addr) {
            relay_peers.entry(peer_id).or_insert(addr.clone());
        }
        let _ = swarm.dial(addr.clone());
    }

    let mut state = RuntimeState {
        peer_id,
        rendezvous_namespace,
        rendezvous_peers,
        relay_peers,
        requested_reservations: HashSet::new(),
        outbound_join_requests: HashMap::new(),
        outbound_join_decisions: HashMap::new(),
        outbound_issuer_offers: HashMap::new(),
        blob_downloads: HashMap::new(),
        join_decider,
        swarm,
        event_tx,
        blob_provider,
        space_authorizer,
    };

    loop {
        tokio::select! {
            Some(cmd) = command_rx.recv() => {
                if command::handle_command(&mut state, cmd).await {
                    break;
                }
            }
            event = state.swarm.select_next_some() => {
                swarm::handle_swarm_event(&mut state, event).await;
            }
        }
    }

    Ok(())
}

pub(crate) fn extract_peer_id(addr: &Multiaddr) -> Option<PeerId> {
    addr.iter()
        .filter_map(|p| match p {
            libp2p::multiaddr::Protocol::P2p(peer_id) => Some(peer_id),
            _ => None,
        })
        .last()
}

pub(crate) fn relay_circuit_addr(local_peer: &PeerId, relay_addr: &Multiaddr) -> Option<Multiaddr> {
    extract_peer_id(relay_addr).map(|_| {
        let mut addr = relay_addr.clone();
        addr.push(Protocol::P2pCircuit);
        addr.push(Protocol::P2p((*local_peer).into()));
        addr
    })
}
