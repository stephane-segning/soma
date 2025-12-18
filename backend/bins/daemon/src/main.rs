use std::path::PathBuf;

use clap::{Parser, Subcommand};
use libp2p::Multiaddr;
use mimalloc::MiMalloc;
use soma_core::SomaResult;
use soma_net::{default_identity_path, generate_identity};
use soma_peer::{PeerCommand, PeerConfig, PeerEvent, spawn_ping_peer};
use soma_socket::serve_unix_message;
use tokio::signal;
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[derive(Debug, Parser)]
#[command(name = "soma-daemon", version)]
struct Args {
    #[command(subcommand)]
    cmd: Option<Command>,

    /// Unix socket path for desktop IPC.
    #[arg(long, env = "SOMA_DAEMON_SOCKET", default_value = "./soma-daemon.sock")]
    socket_path: PathBuf,

    /// Blob storage directory used by the daemon.
    #[arg(long, env = "SOMA_BLOB_DIR", default_value = "./blobs")]
    blob_dir: PathBuf,

    /// Listen multiaddrs for libp2p.
    #[arg(
        long,
        env = "SOMA_LISTEN_ADDRS",
        value_delimiter = ',',
        default_values_t = default_listen_addrs()
    )]
    listen_addrs: Vec<Multiaddr>,

    /// Optional bootstrap peers to dial on startup.
    #[arg(long, env = "SOMA_BOOTSTRAP_ADDRS", value_delimiter = ',')]
    bootstrap_addrs: Vec<Multiaddr>,

    /// Rendezvous nodes to register/discover against.
    #[arg(long, env = "SOMA_RDV_ADDRS", value_delimiter = ',')]
    rendezvous_addrs: Vec<Multiaddr>,

    /// Disable local mDNS discovery.
    #[arg(long, env = "SOMA_DISABLE_MDNS", default_value_t = false)]
    disable_mdns: bool,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Generate the daemon identity and exit.
    GenerateIdentity {
        /// Optional path override for the identity file.
        #[arg(long)]
        path: Option<std::path::PathBuf>,
    },
}

/// Daemon runtime configuration.
#[derive(Debug, Clone)]
struct DaemonConfig {
    socket_path: PathBuf,
    blob_dir: PathBuf,
    identity_path: PathBuf,
    listen_addrs: Vec<Multiaddr>,
    bootstrap_addrs: Vec<Multiaddr>,
    rendezvous_addrs: Vec<Multiaddr>,
    enable_mdns: bool,
}

impl DaemonConfig {
    fn from_args(args: &Args) -> Self {
        Self {
            socket_path: args.socket_path.clone(),
            blob_dir: args.blob_dir.clone(),
            identity_path: default_identity_path("daemon"),
            listen_addrs: args.listen_addrs.clone(),
            bootstrap_addrs: args.bootstrap_addrs.clone(),
            rendezvous_addrs: args.rendezvous_addrs.clone(),
            enable_mdns: !args.disable_mdns,
        }
    }
}

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

fn default_listen_addrs() -> Vec<Multiaddr> {
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

async fn run(config: DaemonConfig) -> SomaResult<()> {
    let DaemonConfig {
        socket_path,
        blob_dir,
        identity_path,
        listen_addrs,
        bootstrap_addrs,
        rendezvous_addrs,
        enable_mdns,
    } = config;

    std::fs::create_dir_all(&blob_dir)?;

    let peer_config = PeerConfig {
        identity_path,
        listen_addrs,
        bootstrap_addrs,
        rendezvous_nodes: rendezvous_addrs,
        rendezvous_namespace: None,
        enable_mdns,
    };
    let peer = spawn_ping_peer(peer_config)?;
    let peer_id = peer.peer_id;
    info!(%peer_id, ?socket_path, ?blob_dir, "soma-daemon starting");

    let socket_msg = format!("soma-daemon alive peer_id={peer_id}\n");
    let socket_task = tokio::spawn(serve_unix_message(socket_path.clone(), socket_msg, async {
        let _ = signal::ctrl_c().await;
    }));
    let peer_task = peer.task;
    let mut peer_events = peer.events;
    tokio::pin!(peer_task);
    tokio::pin!(socket_task);

    loop {
        tokio::select! {
            evt = peer_events.recv() => {
                if let Some(evt) = evt {
                    match evt {
                        PeerEvent::NewListenAddr { address, peer_id } => {
                            info!(%peer_id, listen_addr=%address, "daemon listening");
                        }
                        PeerEvent::PingOk { rtt } => {
                            info!(?rtt, "daemon ping ok");
                        }
                        PeerEvent::PingErr { error } => {
                            warn!(%error, "daemon ping error");
                        }
                        PeerEvent::ConnectionEstablished { peer } => {
                            info!(%peer, "daemon connected");
                        }
                        PeerEvent::ConnectionError { peer, error } => {
                            warn!(?peer, %error, "daemon connection error");
                        }
                        PeerEvent::IdentifyReceived { peer, agent, protocols } => {
                            info!(%peer, %agent, protocols, "daemon identify received");
                        }
                        PeerEvent::MdnsDiscovered { peers } => {
                            info!(peers, "daemon mdns discovered peers");
                        }
                        PeerEvent::RendezvousDiscovered { registrations } => {
                            info!(registrations, "daemon rendezvous discovered");
                        }
                        PeerEvent::ListenerClosed { reason } => {
                            info!(?reason, "daemon listener closed");
                        }
                    }
                } else {
                    break;
                }
            }
            res = &mut peer_task => {
                res??;
                break;
            }
            res = &mut socket_task => {
                res??;
                break;
            }
            _ = signal::ctrl_c() => {
                let _ = peer.commands.send(PeerCommand::Shutdown).await;
                break;
            }
        }
    }

    Ok(())
}
