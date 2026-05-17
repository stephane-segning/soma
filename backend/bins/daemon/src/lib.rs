//! Embeddable runtime for the Soma daemon.
//!
//! This crate is normally consumed via the `soma-daemon` binary, which is a
//! thin clap shim around [`run`]. It can also be embedded directly into other
//! Rust processes (for example a napi-rs addon) that want to host the daemon
//! in-process instead of spawning a separate executable and talking to it over
//! a Unix socket.
//!
//! Embedders should provide their own Tokio runtime, tracing subscriber, signal
//! handling and global allocator — this library installs none of those.

use std::sync::Arc;

use libp2p::Multiaddr;
use soma_core::SomaResult;
use soma_net::IdentityManager;
use soma_peer::{PeerCommand, bootstrap::PeerLauncher};
use soma_proto_build::daemon;
use soma_socket::serve_grpc_unix;
use soma_storage::RepositoryProvider;
use soma_vdfs::BlobProvider;
use soma_vdfs::fs::FsBlobStore;
use std::path::PathBuf;
use tokio::{
    sync::{Mutex, broadcast, mpsc, oneshot},
    task::JoinHandle,
};
use tonic::transport::Server;
use tracing::info;

mod config;
mod dispatch;
mod grpc;
mod handlers;
mod runtime;
mod services;

pub use config::default_listen_addrs;

use dispatch::build_dispatcher;
use grpc::{DaemonService, DaemonState};
use runtime::{DaemonPeerBootstrap, ensure_default_space, spawn_mailbox_sweeper};
use services::space::{DefaultSpaceManager, SpaceManager};

// Internals re-exported only for the binary shim. Not part of the public API.
#[doc(hidden)]
pub mod __bin {
    pub use crate::config::{Args, Command};
}

/// Configuration for the embeddable daemon runtime.
///
/// Plain types only — no clap derives. The binary shim is responsible for
/// turning CLI arguments into a [`RuntimeConfig`]. Embedders can construct one
/// directly.
#[derive(Debug, Clone)]
pub struct RuntimeConfig {
    /// Optional Unix socket path for the desktop gRPC IPC surface.
    ///
    /// When `Some`, the daemon starts a `GrpcUnixServer` on that path. When
    /// `None`, no Unix socket is opened — useful for in-process embedders that
    /// will reach the daemon via direct Rust calls (or via future in-process
    /// transports).
    pub socket_path: Option<PathBuf>,
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
            socket_path: None,
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

/// Snapshot of daemon health for in-process callers (the napi addon, tests).
#[derive(Debug, Clone)]
pub struct DaemonStatus {
    pub peer_id: String,
    pub listen_addrs: Vec<String>,
}

/// Opaque accessor for in-process callers to invoke daemon operations
/// without going through the gRPC trampoline. Cloneable — handles share
/// the same underlying [`DaemonState`].
#[derive(Clone)]
pub struct DaemonHandle {
    state: Arc<DaemonState>,
}

impl DaemonHandle {
    /// Current peer id + listen addresses.
    pub async fn status(&self) -> DaemonStatus {
        DaemonStatus {
            peer_id: self.state.peer_id.to_string(),
            listen_addrs: self.state.listen_addrs.lock().await.clone(),
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
    grpc_shutdown: Option<oneshot::Sender<()>>,
    supervisor: JoinHandle<SomaResult<()>>,
    socket_path: Option<PathBuf>,
    state: Arc<DaemonState>,
}

impl RuntimeHandle {
    /// Cloneable in-process accessor for daemon operations. Lets the napi
    /// addon (or tests) invoke daemon methods without going through the gRPC
    /// trampoline.
    pub fn handle(&self) -> DaemonHandle {
        DaemonHandle {
            state: self.state.clone(),
        }
    }

    /// Gracefully shut the runtime down: tell the peer to stop, cancel the
    /// gRPC server if it was started, then await the supervisor task.
    pub async fn shutdown(mut self) -> SomaResult<()> {
        let _ = self.peer_commands.send(PeerCommand::Shutdown).await;
        if let Some(tx) = self.grpc_shutdown.take() {
            let _ = tx.send(());
        }
        let result = match self.supervisor.await {
            Ok(res) => res,
            Err(err) if err.is_cancelled() => Ok(()),
            Err(err) => Err(soma_core::Error::Anyhow(err.into())),
        };

        if let Some(path) = self.socket_path.as_ref()
            && path.exists()
        {
            let _ = std::fs::remove_file(path);
        }

        result
    }

    /// Wait for the supervisor task to finish on its own (peer exit, gRPC
    /// failure, etc.) without explicitly signalling shutdown.
    pub async fn wait(self) -> SomaResult<()> {
        match self.supervisor.await {
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
        socket_path,
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

    // The migrator is a process-wide singleton — fine to keep here even when
    // multiple daemon instances share the same process, because it only holds
    // immutable migration metadata.
    static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../../crates/storage/migrations");

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
    info!(%peer_id, ?socket_path, ?blob_dir, "soma-daemon starting");

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

    let daemon_service = DaemonService {
        state: state.clone(),
    };
    let grpc_svc = daemon::daemon_server::DaemonServer::new(daemon_service);

    // gRPC-over-Unix-socket is optional: only start the listener if the
    // embedder explicitly requested one. The binary always does; an embedded
    // host (e.g. napi addon) typically won't.
    let (grpc_task, grpc_shutdown_tx) = if let Some(path) = socket_path.clone() {
        let (tx, rx) = oneshot::channel::<()>();
        let router = Server::builder().add_service(grpc_svc);
        let task: JoinHandle<SomaResult<()>> = tokio::spawn(async move {
            serve_grpc_unix(path, router, async move {
                let _ = rx.await;
            })
            .await
        });
        (Some(task), Some(tx))
    } else {
        (None, None)
    };

    let peer_task = peer.task;
    let mut peer_events = peer.events;
    let peer_commands_for_handle = peer.commands.clone();

    let dispatcher = build_dispatcher(state.clone()).await;
    spawn_mailbox_sweeper(state.clone());

    let socket_path_for_supervisor = socket_path.clone();
    let state_for_supervisor = state.clone();
    let supervisor: JoinHandle<SomaResult<()>> = tokio::spawn(async move {
        tokio::pin!(peer_task);
        let mut grpc_task = grpc_task;

        let result = loop {
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
                res = async {
                    match grpc_task.as_mut() {
                        Some(handle) => handle.await,
                        None => std::future::pending().await,
                    }
                }, if grpc_task.is_some() => {
                    break res.map_err(|e| soma_core::Error::Anyhow(e.into())).and_then(|inner| inner);
                }
            }
        };

        if let Some(path) = socket_path_for_supervisor.as_ref()
            && path.exists()
        {
            let _ = std::fs::remove_file(path);
        }

        result
    });

    Ok(RuntimeHandle {
        peer_commands: peer_commands_for_handle,
        grpc_shutdown: grpc_shutdown_tx,
        supervisor,
        socket_path,
        state,
    })
}
