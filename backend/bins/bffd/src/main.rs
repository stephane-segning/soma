use std::net::SocketAddr;

use clap::Parser;
use libp2p::Multiaddr;
use mimalloc::MiMalloc;
use soma_peer::{PeerConfig, PeerEvent, spawn_ping_peer};
use tracing::{info, warn};

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[derive(Debug, Parser)]
#[command(name = "soma-bffd", version)]
struct Args {
    #[arg(long, env = "HTTP_ADDR", default_value = "0.0.0.0:8083")]
    http_addr: SocketAddr,

    /// Enable optional libp2p peer (disabled by default).
    #[arg(long, env = "SOMA_P2P_ENABLE", default_value_t = false)]
    p2p_enable: bool,

    /// Listen multiaddrs for the optional peer.
    #[arg(long, env = "SOMA_P2P_LISTEN_ADDRS", value_delimiter = ',')]
    p2p_listen_addrs: Vec<Multiaddr>,

    /// Bootstrap peers for the optional peer.
    #[arg(long, env = "SOMA_P2P_BOOTSTRAP_ADDRS", value_delimiter = ',')]
    p2p_bootstrap_addrs: Vec<Multiaddr>,
}

#[tokio::main]
async fn main() -> soma_core::SomaResult<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let Args {
        http_addr,
        p2p_enable,
        mut p2p_listen_addrs,
        p2p_bootstrap_addrs,
    } = Args::parse();

    if p2p_enable {
        if p2p_listen_addrs.is_empty() {
            p2p_listen_addrs = default_listen_addrs();
        }
        let mut config = PeerConfig::with_identity("bff");
        config.listen_addrs = p2p_listen_addrs;
        config.bootstrap_addrs = p2p_bootstrap_addrs;
        let peer = spawn_ping_peer(config)?;
        let mut events = peer.events;

        tokio::spawn(async move {
            while let Some(evt) = events.recv().await {
                match evt {
                    PeerEvent::NewListenAddr { address, peer_id } => {
                        info!(%peer_id, listen_addr=%address, "bff peer listening");
                    }
                    PeerEvent::PingOk { rtt } => {
                        info!(?rtt, "bff peer ping ok");
                    }
                    PeerEvent::PingErr { error } => {
                        warn!(%error, "bff peer ping error");
                    }
                    PeerEvent::ListenerClosed { reason } => {
                        info!(?reason, "bff peer listener closed");
                    }
                    _ => todo!(),
                }
            }
        });

        tokio::spawn(async move {
            let _ = peer.task.await;
        });
    }

    // Build business API (Axum lives in crate for BFF).
    let app = soma_bff::app().nest_service("/metrics", soma_metrics::router("bff"));

    soma_bff::run(http_addr, app).await
}

fn default_listen_addrs() -> Vec<Multiaddr> {
    vec![
        "/ip4/0.0.0.0/tcp/14010"
            .parse()
            .expect("valid tcp multiaddr"),
        "/ip4/0.0.0.0/udp/14210/quic-v1"
            .parse()
            .expect("valid quic multiaddr"),
        "/ip4/0.0.0.0/tcp/14110/ws"
            .parse()
            .expect("valid ws multiaddr"),
    ]
}
