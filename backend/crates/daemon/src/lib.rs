//! Embeddable runtime for the Soma daemon.
//!
//! There is no standalone `soma-daemon` binary anymore; the daemon ships only
//! as a library, linked into the `soma-node` napi addon and consumed in-process
//! by the Electron desktop app. Embedders provide their own Tokio runtime,
//! tracing subscriber, and signal handling — this library installs none.

use std::sync::Arc;

use libp2p::Multiaddr;
use soma_core::SomaResult;
use soma_net::IdentityManager;
use soma_peer::{PeerCommand, bootstrap::PeerLauncher};
use soma_storage::RepositoryProvider;
use soma_vdfs::BlobProvider;
use soma_vdfs::fs::FsBlobStore;
use std::path::PathBuf;
use tokio::{
    sync::{Mutex, broadcast, mpsc},
    task::JoinHandle,
};
use tracing::info;

mod dispatch;
mod handle;
mod handlers;
mod runtime;
mod services;
mod state;

pub use handle::{DaemonHandle, DaemonStatus, types as handle_types};
pub use state::DaemonState;

use dispatch::build_dispatcher;
use runtime::{DaemonPeerBootstrap, ensure_default_space, spawn_mailbox_sweeper};
use services::space::{DefaultSpaceManager, SpaceManager};

/// Default libp2p listen multiaddrs for the daemon.
pub fn default_listen_addrs() -> Vec<Multiaddr> {
    vec![
        "/ip4/0.0.0.0/tcp/14007"
            .parse()
            .expect("valid tcp multiaddr"),
        "/ip4/0.0.0.0/udp/14207/quic-v1"
            .parse()
            .expect("valid quic multiaddr"),
        "/ip4/0.0.0.0/tcp/14107/ws"
            .parse()
            .expect("valid websocket multiaddr"),
    ]
}

/// Configuration for the embeddable daemon runtime.
#[derive(Debug, Clone)]
pub struct RuntimeConfig {
    /// Blob storage directory.
    pub blob_dir: PathBuf,
    /// SQLite database path for the daemon repositories.
    pub db_path: PathBuf,
    /// Path to the libp2p identity (Ed25519 keypair) on disk.
    pub identity_path: PathBuf,
    /// libp2p listen multiaddrs.
    pub listen_addrs: Vec<Multiaddr>,
    /// Optional bootstrap peers to dial on startup.
    pub bootstrap_addrs: Vec<Multiaddr>,
    /// Rendezvous nodes to register/discover against.
    pub rendezvous_addrs: Vec<Multiaddr>,
    /// Relay nodes to reserve slots against.
    pub relay_addrs: Vec<Multiaddr>,
    /// Whether to enable local mDNS discovery.
    pub enable_mdns: bool,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        let idm = IdentityManager::from_env();
        Self {
            blob_dir: PathBuf::from("./blobs"),
            db_path: PathBuf::from("./daemon.db"),
            identity_path: idm.default_identity_path("daemon"),
            listen_addrs: default_listen_addrs(),
            bootstrap_addrs: Vec::new(),
            rendezvous_addrs: Vec::new(),
            relay_addrs: Vec::new(),
            enable_mdns: true,
        }
    }
}

/// Handle to a running daemon. Drop without calling [`shutdown`] is allowed but
/// will leave the runtime running until its background tasks finish on their
/// own (e.g. ctrl-c handled by the embedder).
///
/// [`shutdown`]: RuntimeHandle::shutdown
pub struct RuntimeHandle {
    peer_commands: mpsc::Sender<PeerCommand>,
    supervisor: JoinHandle<SomaResult<()>>,
    state: Arc<DaemonState>,
}

impl RuntimeHandle {
    /// Cloneable in-process accessor for daemon operations.
    pub fn handle(&self) -> DaemonHandle {
        DaemonHandle::new(self.state.clone())
    }

    /// Gracefully shut the runtime down: tell the peer to stop, then await the
    /// supervisor task.
    pub async fn shutdown(self) -> SomaResult<()> {
        let _ = self.peer_commands.send(PeerCommand::Shutdown).await;
        match self.supervisor.await {
            Ok(res) => res,
            Err(err) if err.is_cancelled() => Ok(()),
            Err(err) => Err(soma_core::Error::Anyhow(err.into())),
        }
    }

    /// Wait for the supervisor task to finish on its own (peer exit, etc.)
    /// without explicitly signalling shutdown.
    pub async fn wait(&mut self) -> SomaResult<()> {
        match (&mut self.supervisor).await {
            Ok(res) => res,
            Err(err) if err.is_cancelled() => Ok(()),
            Err(err) => Err(soma_core::Error::Anyhow(err.into())),
        }
    }
}

/// Start the daemon runtime in the background and return a [`RuntimeHandle`].
///
/// The caller must drive a Tokio runtime; this function does not spawn one.
/// Tracing, signal handling and global allocator configuration are the
/// embedder's responsibility.
pub async fn run(config: RuntimeConfig) -> SomaResult<RuntimeHandle> {
    let RuntimeConfig {
        blob_dir,
        db_path,
        identity_path,
        listen_addrs,
        bootstrap_addrs,
        rendezvous_addrs,
        relay_addrs,
        enable_mdns,
    } = config;

    std::fs::create_dir_all(&blob_dir)?;
    let blob_store = FsBlobStore::new(blob_dir.clone());
    let blob_provider: Arc<dyn BlobProvider> = Arc::new(blob_store.clone());

    static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../storage/migrations");

    let db_url = soma_core::db::normalize_sqlite_url(db_path.to_string_lossy().as_ref());
    info!(%db_url, scheme = "sqlite", "configuring database");
    let repos = soma_storage::bootstrap::connect_any(&db_url, &MIGRATOR).await?;
    let repos: Arc<dyn RepositoryProvider> = Arc::new(repos);

    let bootstrapper = DaemonPeerBootstrap {
        identity_path: identity_path.clone(),
        listen_addrs,
        bootstrap_addrs,
        rendezvous_addrs,
        relay_addrs,
        enable_mdns,
        blob_provider: blob_provider.clone(),
        repos: repos.clone(),
    };

    let (peer, net_identity) = PeerLauncher::new(&bootstrapper).spawn()?;
    let peer_id = peer.peer_id;
    info!(%peer_id, ?blob_dir, "soma-daemon starting");

    let (event_tx, _) = broadcast::channel(64);
    let space_manager: Arc<dyn SpaceManager> = Arc::new(DefaultSpaceManager::new(
        repos.clone(),
        net_identity.keypair().clone(),
        peer_id,
    ));
    let state = Arc::new(DaemonState {
        peer_id,
        peer_commands: peer.commands.clone(),
        listen_addrs: Mutex::new(Vec::new()),
        events: event_tx,
        repos,
        signer: net_identity.keypair().clone(),
        blob_store,
        space_manager,
        identify_keys: Mutex::new(std::collections::HashMap::new()),
    });

    ensure_default_space(&state.space_manager).await?;

    let peer_task = peer.task;
    let mut peer_events = peer.events;
    let peer_commands_for_handle = peer.commands.clone();

    let dispatcher = build_dispatcher(state.clone()).await;
    spawn_mailbox_sweeper(state.clone());

    let state_for_supervisor = state.clone();
    let supervisor: JoinHandle<SomaResult<()>> = tokio::spawn(async move {
        tokio::pin!(peer_task);

        loop {
            tokio::select! {
                evt = peer_events.recv() => {
                    match evt {
                        Some(evt) => dispatcher.dispatch(&state_for_supervisor, &evt).await,
                        None => break Ok(()),
                    }
                }
                res = &mut peer_task => {
                    break res.map_err(|e| soma_core::Error::Anyhow(e.into())).and_then(|inner| inner);
                }
            }
        }
    });

    Ok(RuntimeHandle {
        peer_commands: peer_commands_for_handle,
        supervisor,
        state,
    })
}
