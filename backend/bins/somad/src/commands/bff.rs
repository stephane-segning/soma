//! `somad bff` — LLM backend-for-frontend service.
//!
//! Ported from the former `bins/bffd`. The only subcommand that does NOT use
//! libp2p by default; an optional libp2p peer can be enabled via `--p2p-enable`
//! for diagnostics/testing. Shared logic lives in `crates/bff`.

use std::net::SocketAddr;
use std::path::Path;

use libp2p::Multiaddr;
use once_cell::sync::Lazy;
use soma_core::http::{HttpServer, HttpService};
use soma_net::IdentityManager;
use soma_peer::bootstrap::{PeerBootstrapper, PeerLauncher};
use soma_peer::{PeerConfig, PeerEvent};
use tracing::{info, warn};

#[derive(Debug, clap::Args)]
pub struct Args {
    /// HTTP address for the BFF API + /metrics.
    #[arg(long, env = "HTTP_ADDR", default_value = "0.0.0.0:8083")]
    pub http_addr: SocketAddr,

    /// Enable the optional libp2p diagnostic peer.
    #[arg(long, env = "SOMA_P2P_ENABLE", default_value_t = false)]
    pub p2p_enable: bool,

    /// Listen multiaddrs for the optional peer (defaults if empty).
    #[arg(long, env = "SOMA_P2P_LISTEN_ADDRS", value_delimiter = ',')]
    pub p2p_listen_addrs: Vec<Multiaddr>,

    /// Bootstrap peers for the optional peer.
    #[arg(long, env = "SOMA_P2P_BOOTSTRAP_ADDRS", value_delimiter = ',')]
    pub p2p_bootstrap_addrs: Vec<Multiaddr>,
}

fn default_listen_addrs() -> Vec<Multiaddr> {
    vec![
        "/ip4/0.0.0.0/tcp/14010".parse().unwrap(),
        "/ip4/0.0.0.0/udp/14210/quic-v1".parse().unwrap(),
        "/ip4/0.0.0.0/tcp/14110/ws".parse().unwrap(),
    ]
}

pub async fn run(args: Args) -> anyhow::Result<()> {
    let Args {
        http_addr,
        p2p_enable,
        mut p2p_listen_addrs,
        p2p_bootstrap_addrs,
    } = args;

    if p2p_enable {
        if p2p_listen_addrs.is_empty() {
            p2p_listen_addrs = default_listen_addrs();
        }

        let bootstrapper = BffPeerBootstrap {
            listen_addrs: p2p_listen_addrs,
            bootstrap_addrs: p2p_bootstrap_addrs,
        };

        let (peer, _identity) = PeerLauncher::new(&bootstrapper).spawn()?;
        let soma_peer::PeerHandle {
            peer_id,
            task,
            mut events,
            ..
        } = peer;

        tokio::spawn(async move {
            while let Some(evt) = events.recv().await {
                match evt {
                    PeerEvent::NewListenAddr { address, peer_id } => {
                        info!(%peer_id, listen_addr = %address, "bff peer listening");
                    }
                    PeerEvent::PingOk { rtt } => info!(?rtt, "bff peer ping ok"),
                    PeerEvent::PingErr { error } => warn!(%error, "bff peer ping error"),
                    PeerEvent::ConnectionEstablished { peer } => {
                        info!(%peer, "bff peer connection established");
                    }
                    PeerEvent::ConnectionError { peer, error } => {
                        warn!(?peer, %error, "bff peer connection error");
                    }
                    PeerEvent::IdentifyReceived {
                        peer,
                        agent,
                        protocols,
                        ..
                    } => {
                        info!(%peer, %agent, protocols, "bff peer identify received");
                    }
                    PeerEvent::MdnsDiscovered { peers } => {
                        info!(peers, "bff peer mdns discovered");
                    }
                    PeerEvent::RendezvousDiscovered { registrations } => {
                        info!(registrations, "bff peer rendezvous discovered");
                    }
                    PeerEvent::RelayReserved { relay } => {
                        info!(%relay, "bff relay reservation accepted");
                    }
                    PeerEvent::RelayCircuitEstablished { relay } => {
                        info!(%relay, "bff relay circuit established");
                    }
                    PeerEvent::ListenerClosed { reason } => {
                        info!(?reason, "bff peer listener closed");
                    }
                    PeerEvent::JoinRequestSubmitted { target, request_id } => {
                        info!(%target, %request_id, "bff join request submitted");
                    }
                    PeerEvent::JoinDecision { from, decision } => {
                        info!(%from, decision = decision.decision, "bff join decision received");
                    }
                    PeerEvent::JoinFailed { target, error } => {
                        warn!(%target, %error, "bff join failed");
                    }
                    _ => {}
                }
            }
        });

        tokio::spawn(async move {
            let _ = task.await;
        });

        info!(%peer_id, "bff p2p enabled");
    }

    let service = BffHttpService { http_addr };
    HttpServer::new(service)
        .run()
        .await
        .map_err(|e| anyhow::anyhow!(e))
}

struct BffHttpService {
    http_addr: SocketAddr,
}

impl HttpService for BffHttpService {
    fn addr(&self) -> SocketAddr {
        self.http_addr
    }

    fn router(self) -> axum::Router {
        soma_bff::app().merge(soma_metrics::router("bff"))
    }
}

struct BffPeerBootstrap {
    listen_addrs: Vec<Multiaddr>,
    bootstrap_addrs: Vec<Multiaddr>,
}

impl PeerBootstrapper for BffPeerBootstrap {
    fn identity_path(&self) -> &Path {
        static PATH: Lazy<std::path::PathBuf> =
            Lazy::new(|| IdentityManager::from_env().default_identity_path("bff"));
        &PATH
    }

    fn build_config(&self, _identity: &soma_net::NetIdentity) -> PeerConfig {
        let mut config = PeerConfig::with_identity("bff");
        config.listen_addrs = self.listen_addrs.clone();
        config.bootstrap_addrs = self.bootstrap_addrs.clone();
        config
    }
}
