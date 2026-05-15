use std::sync::Arc;

use libp2p::{PeerId, identity::Keypair};
use soma_peer::PeerCommand;
use soma_proto_build::daemon;
use soma_storage::RepositoryProvider;
use soma_vdfs::fs::FsBlobStore;
use tokio::sync::{Mutex, broadcast, mpsc};

use crate::services::space::SpaceManager;

/// Daemon shared state (peer id, command channel, listeners, event bus).
pub struct DaemonState {
    pub peer_id: PeerId,
    pub peer_commands: mpsc::Sender<PeerCommand>,
    pub listen_addrs: Mutex<Vec<String>>,
    pub events: broadcast::Sender<daemon::DaemonEvent>,
    pub repos: Arc<dyn RepositoryProvider>,
    pub signer: Keypair,
    pub blob_store: FsBlobStore,
    pub space_manager: Arc<dyn SpaceManager>,
    pub identify_keys: Mutex<std::collections::HashMap<PeerId, libp2p::identity::PublicKey>>,
}

impl DaemonState {
    pub async fn publish(&self, event: daemon::DaemonEvent) {
        let _ = self.events.send(event);
    }
}

#[derive(Clone)]
pub struct DaemonService {
    pub state: Arc<DaemonState>,
}
