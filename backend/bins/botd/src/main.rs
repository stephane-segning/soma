use std::{net::SocketAddr, path::PathBuf};

use axum::{
    Json, Router,
    routing::{get, post},
};
use clap::{Parser, Subcommand};
use libp2p::Multiaddr;
use mimalloc::MiMalloc;
use prometheus_client::{
    metrics::{counter::Counter, family::Family},
    registry::Registry,
};
use prometheus_client_derive_encode::EncodeLabelSet;
use serde::Serialize;
use soma_core::SomaResult;
use soma_metrics::{SharedRegistry, router_with_registry};
use soma_net::{default_identity_path, generate_identity};
use soma_peer::{PeerCommand, PeerConfig, PeerEvent, spawn_ping_peer};
use tokio::signal;
use tracing::{info, warn};

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[derive(Debug, Parser)]
#[command(name = "soma-botd", version)]
struct Args {
    #[command(subcommand)]
    cmd: Option<Command>,

    #[arg(long, env = "HTTP_ADDR", default_value = "0.0.0.0:8080")]
    http_addr: SocketAddr,

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

    /// Relay nodes to reserve slots against.
    #[arg(long, env = "SOMA_RELAY_ADDRS", value_delimiter = ',')]
    relay_addrs: Vec<Multiaddr>,

    /// Disable mdns discovery (default on).
    #[arg(long, env = "SOMA_DISABLE_MDNS", default_value_t = false)]
    disable_mdns: bool,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Generate the botd identity and exit.
    GenerateIdentity {
        /// Optional path override for the identity file.
        #[arg(long)]
        path: Option<std::path::PathBuf>,
    },
}

#[tokio::main]
async fn main() -> SomaResult<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let args = Args::parse();

    if let Some(Command::GenerateIdentity { path }) = args.cmd {
        let path = path.unwrap_or_else(|| default_identity_path("bot"));
        let id = generate_identity(&path)?;
        println!(
            "generated bot identity at {:?}, peer_id={}",
            path,
            id.peer_id()
        );
        return Ok(());
    }

    let config = BotConfig::from_args(&args);
    let metrics = BotMetrics::new();

    run(config, metrics).await
}

#[derive(Debug, Clone)]
struct BotConfig {
    identity_path: PathBuf,
    blob_dir: PathBuf,
    http_addr: SocketAddr,
    listen_addrs: Vec<Multiaddr>,
    bootstrap_addrs: Vec<Multiaddr>,
    rendezvous_addrs: Vec<Multiaddr>,
    relay_addrs: Vec<Multiaddr>,
    enable_mdns: bool,
}

impl BotConfig {
    fn from_args(args: &Args) -> Self {
        Self {
            identity_path: default_identity_path("bot"),
            blob_dir: args.blob_dir.clone(),
            http_addr: args.http_addr,
            listen_addrs: args.listen_addrs.clone(),
            bootstrap_addrs: args.bootstrap_addrs.clone(),
            rendezvous_addrs: args.rendezvous_addrs.clone(),
            relay_addrs: args.relay_addrs.clone(),
            enable_mdns: !args.disable_mdns,
        }
    }
}

#[derive(Clone, Debug, EncodeLabelSet, Hash, PartialEq, Eq)]
struct PingLabels {
    outcome: &'static str,
}

#[derive(Clone)]
struct BotMetrics {
    registry: SharedRegistry,
    listeners: Family<(), Counter>,
    pings: Family<PingLabels, Counter>,
}

impl BotMetrics {
    fn new() -> Self {
        let mut registry = Registry::with_prefix("soma_bot");

        let listeners = Family::<(), Counter>::default();
        registry.register(
            "listen_events_total",
            "Bot listen events",
            listeners.clone(),
        );

        let pings = Family::<PingLabels, Counter>::default();
        registry.register("ping_total", "Ping successes/failures", pings.clone());

        Self {
            registry: std::sync::Arc::new(registry),
            listeners,
            pings,
        }
    }

    fn router(&self) -> Router {
        router_with_registry(self.registry.clone())
    }
}

#[derive(Debug, Clone, Serialize)]
struct BotInfo {
    peer_id: String,
    blob_dir: PathBuf,
}

fn default_listen_addrs() -> Vec<Multiaddr> {
    vec![
        "/ip4/0.0.0.0/tcp/14005"
            .parse()
            .expect("valid tcp multiaddr"),
        "/ip4/0.0.0.0/tcp/14105/ws"
            .parse()
            .expect("valid ws multiaddr"),
        "/ip4/0.0.0.0/udp/14205/quic-v1"
            .parse()
            .expect("valid quic multiaddr"),
    ]
}

async fn run(config: BotConfig, metrics: BotMetrics) -> SomaResult<()> {
    std::fs::create_dir_all(&config.blob_dir)?;

    let peer_config = PeerConfig {
        identity_path: config.identity_path.clone(),
        listen_addrs: config.listen_addrs.clone(),
        bootstrap_addrs: config.bootstrap_addrs.clone(),
        rendezvous_nodes: config.rendezvous_addrs.clone(),
        relay_addrs: config.relay_addrs.clone(),
        rendezvous_namespace: None,
        enable_mdns: config.enable_mdns,
    };
    let peer = spawn_ping_peer(peer_config)?;
    let peer_id = peer.peer_id;

    info!(
        %peer_id,
        http_addr = %config.http_addr,
        blob_dir = %config.blob_dir.display(),
        "starting soma-botd"
    );

    let http_handle = tokio::spawn({
        let info = BotInfo {
            peer_id: peer_id.to_string(),
            blob_dir: config.blob_dir.clone(),
        };
        let metrics = metrics.clone();
        async move { serve_http(config.http_addr, info, metrics).await }
    });
    let peer_task = peer.task;
    let mut peer_events = peer.events;
    tokio::pin!(peer_task);
    tokio::pin!(http_handle);

    loop {
        tokio::select! {
            evt = peer_events.recv() => {
                if let Some(evt) = evt {
                    match evt {
                        PeerEvent::NewListenAddr { address, peer_id } => {
                            metrics.listeners.get_or_create(&()).inc();
                            info!(%peer_id, listen_addr=%address, "bot listening");
                        }
                        PeerEvent::PingOk { rtt } => {
                            metrics.pings.get_or_create(&PingLabels { outcome: "ok" }).inc();
                            info!(?rtt, "ping success");
                        }
                        PeerEvent::PingErr { error } => {
                            metrics.pings.get_or_create(&PingLabels { outcome: "error" }).inc();
                            warn!(%error, "ping error");
                        }
                        PeerEvent::ConnectionEstablished { peer } => {
                            info!(%peer, "bot connection established");
                        }
                        PeerEvent::ConnectionError { peer, error } => {
                            warn!(?peer, %error, "bot connection error");
                        }
                        PeerEvent::IdentifyReceived { peer, agent, protocols } => {
                            info!(%peer, %agent, protocols, "bot identify received");
                        }
                        PeerEvent::MdnsDiscovered { peers } => {
                            info!(peers, "bot mdns discovered peers");
                        }
                        PeerEvent::RendezvousDiscovered { registrations } => {
                            info!(registrations, "bot rendezvous discovered");
                        }
                        PeerEvent::RelayReserved { relay } => {
                            info!(%relay, "bot relay reservation accepted");
                        }
                        PeerEvent::RelayCircuitEstablished { relay } => {
                            info!(%relay, "bot relay circuit established");
                        }
                        PeerEvent::ListenerClosed { reason } => {
                            warn!(?reason, "bot listener closed");
                        }
                        PeerEvent::JoinRequestSubmitted { .. } => {}
                        PeerEvent::JoinDecision { .. } => {}
                        PeerEvent::JoinFailed { .. } => {}
                    }
                } else {
                    break;
                }
            }
            res = &mut peer_task => {
                res??;
                break;
            }
            res = &mut http_handle => {
                res??;
                break;
            }
            _ = signal::ctrl_c() => {
                warn!("botd shutdown requested");
                let _ = peer.commands.send(PeerCommand::Shutdown).await;
                break;
            }
        }
    }

    Ok(())
}

async fn serve_http(http_addr: SocketAddr, info: BotInfo, metrics: BotMetrics) -> SomaResult<()> {
    let app = Router::new()
        .route(
            "/info",
            get({
                let info = info.clone();
                move || async move { Json(info.clone()) }
            }),
        )
        .route(
            "/echo",
            post(|Json(body): Json<serde_json::Value>| async move { Json(body) }),
        )
        .merge(metrics.router());

    let listener = tokio::net::TcpListener::bind(http_addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
