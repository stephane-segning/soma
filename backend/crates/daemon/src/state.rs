use std::sync::Arc;

use libp2p::{PeerId, identity::Keypair};
use soma_peer::PeerCommand;
use soma_peer::blob::BlobResolver;
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
    /// Peer-to-peer fallback for `DaemonHandle::read_blob` on a local miss.
    /// See `soma_peer::blob` for the resolver design.
    pub blob_resolver: Arc<dyn BlobResolver>,
    pub space_manager: Arc<dyn SpaceManager>,
    pub identify_keys: Mutex<std::collections::HashMap<PeerId, libp2p::identity::PublicKey>>,
}

impl DaemonState {
    pub async fn publish(&self, event: daemon::DaemonEvent) {
        let _ = self.events.send(event);
    }
}

impl soma_replication::SyncContext for DaemonState {
    fn repos(&self) -> Arc<dyn RepositoryProvider> {
        self.repos.clone()
    }

    fn local_peer_id(&self) -> PeerId {
        self.peer_id
    }

    fn peer_commands(&self) -> &mpsc::Sender<PeerCommand> {
        &self.peer_commands
    }
}
