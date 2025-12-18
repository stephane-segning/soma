use clap::Parser;
use mimalloc::MiMalloc;
use soma_core::SomaResult;
use soma_net::{default_identity_path, generate_identity};
use soma_peer::{PeerCommand, PeerConfig, spawn_ping_peer};
use soma_proto_build::daemon::v1 as daemon;
use tokio::{signal, sync::{broadcast, Mutex}};
use tracing::info;
use tracing_subscriber::EnvFilter;

use std::sync::Arc;

mod config;
mod dispatch;
mod grpc;
mod handlers;

use config::{Args, Command, DaemonConfig};
use dispatch::build_dispatcher;
use grpc::{DaemonService, DaemonState, serve_grpc};

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[tokio::main]
async fn main() -> SomaResult<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let args = Args::parse();

    if let Some(Command::GenerateIdentity { path }) = args.cmd {
        let path = path.unwrap_or_else(|| default_identity_path("daemon"));
        let id = generate_identity(&path).expect("generate identity");
        println!(
            "generated daemon identity at {:?}, peer_id={}",
            path,
            id.peer_id()
        );
        return Ok(());
    }

    let config = DaemonConfig::from_args(&args);
    run(config).await
}

async fn run(config: DaemonConfig) -> SomaResult<()> {
    let DaemonConfig {
        socket_path,
        blob_dir,
        identity_path,
        listen_addrs,
        bootstrap_addrs,
        rendezvous_addrs,
        relay_addrs,
        enable_mdns,
    } = config;

    std::fs::create_dir_all(&blob_dir)?;

    let peer_config = PeerConfig::builder()
        .identity_path(identity_path)
        .listen_addrs(listen_addrs)
        .bootstrap_addrs(bootstrap_addrs)
        .rendezvous_nodes(rendezvous_addrs)
        .relay_addrs(relay_addrs)
        .enable_mdns(enable_mdns)
        .build()
        .expect("peer config");

    let peer = spawn_ping_peer(peer_config)?;
    let peer_id = peer.peer_id;
    info!(%peer_id, ?socket_path, ?blob_dir, "soma-daemon starting");

    let (event_tx, _) = broadcast::channel(64);
    let state = Arc::new(DaemonState {
        peer_id,
        peer_commands: peer.commands.clone(),
        listen_addrs: Mutex::new(Vec::new()),
        events: event_tx,
    });

    let grpc_service = daemon::daemon_server::DaemonServer::new(DaemonService {
        state: state.clone(),
    });

    let grpc_task = tokio::spawn(serve_grpc(socket_path.clone(), grpc_service));
    let peer_task = peer.task;
    let mut peer_events = peer.events;

    // Event handling: fan out to per-kind handlers via dispatcher.
    let dispatcher = build_dispatcher(state.clone()).await;

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
