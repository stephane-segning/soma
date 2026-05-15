use clap::Parser;
use soma_core::SomaResult;
use soma_net::IdentityManager;
use soma_peer::{PeerCommand, bootstrap::PeerLauncher};
use soma_proto_build::daemon;
use soma_socket::GrpcUnixServer;
use soma_storage::RepositoryProvider;
use soma_vdfs::BlobProvider;
use std::sync::Arc;
use tokio::{
    signal,
    sync::{Mutex, broadcast},
};
use tracing::info;

use crate::config::{Args, Command, DaemonConfig};
use crate::dispatch::build_dispatcher;
use crate::grpc::{DaemonService, DaemonState};
use crate::services::space::{DefaultSpaceManager, SpaceManager};
use bootstrap::DaemonPeerBootstrap;
use grpc_service::DaemonGrpcService;
use helpers::{ensure_default_space, spawn_mailbox_sweeper};
use soma_vdfs::fs::FsBlobStore;

mod bootstrap;
mod grpc_service;
mod helpers;

/// Build configuration from CLI args and run the daemon runtime.
pub async fn run_from_cli() -> SomaResult<()> {
    let args = Args::parse();

    let idm = IdentityManager::from_env();

    if let Some(Command::GenerateIdentity { path }) = args.cmd {
        let path = path.unwrap_or_else(|| idm.default_identity_path("daemon"));
        let id = idm.generate(&path)?;
        info!(
            "generated daemon identity at {:?}, peer_id={}",
            path,
            id.peer_id()
        );
        return Ok(());
    }

    let config = DaemonConfig::from_args(&args);
    run(config).await
}

pub async fn run(config: DaemonConfig) -> SomaResult<()> {
    let DaemonConfig {
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
    let grpc_service = daemon::daemon_server::DaemonServer::new(daemon_service);
    let grpc_service = DaemonGrpcService {
        socket_path: socket_path.clone(),
        svc: grpc_service,
    };
    let grpc_task = tokio::spawn(async move { GrpcUnixServer::new(grpc_service).run().await });
    let peer_task = peer.task;
    let mut peer_events = peer.events;

    let dispatcher = build_dispatcher(state.clone()).await;
    spawn_mailbox_sweeper(state.clone());

    tokio::pin!(peer_task);
    tokio::pin!(grpc_task);

    loop {
        tokio::select! {
            evt = peer_events.recv() => {
                if let Some(evt) = evt {
                    dispatcher.dispatch(&state, &evt).await;
                } else {
                    break;
                }
            }
            res = &mut peer_task => {
                res??;
                break;
            }
            res = &mut grpc_task => {
                res??;
                break;
            }
            _ = signal::ctrl_c() => {
                let _ = peer.commands.send(PeerCommand::Shutdown).await;
                break;
            }
        }
    }

    if socket_path.exists() {
        let _ = std::fs::remove_file(socket_path);
    }

    Ok(())
}
