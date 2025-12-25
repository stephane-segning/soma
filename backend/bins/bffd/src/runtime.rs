use clap::Parser;
use soma_core::SomaResult;
use soma_core::http::{HttpService, run_http};
use soma_peer::{PeerConfig, PeerEvent};
use soma_peer::bootstrap::{PeerBootstrapper, spawn_with_identity};
use tracing::{info, warn};

use crate::config::{Args, default_listen_addrs};

pub async fn run_from_cli() -> SomaResult<()> {
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

        let bootstrapper = BffPeerBootstrap {
            listen_addrs: p2p_listen_addrs.clone(),
            bootstrap_addrs: p2p_bootstrap_addrs.clone(),
        };

        let (peer, _identity) = spawn_with_identity(&bootstrapper)?;
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
                        info!(%peer_id, listen_addr=%address, "bff peer listening");
                    }
                    PeerEvent::PingOk { rtt } => {
                        info!(?rtt, "bff peer ping ok");
                    }
                    PeerEvent::PingErr { error } => {
                        warn!(%error, "bff peer ping error");
                    }
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
    run_http(service).await
}

struct BffHttpService {
    http_addr: std::net::SocketAddr,
}

impl HttpService for BffHttpService {
    fn addr(&self) -> std::net::SocketAddr {
        self.http_addr
    }

    fn router(self) -> axum::Router {
        soma_bff::app().merge(soma_metrics::router("bff"))
    }
}

struct BffPeerBootstrap {
    listen_addrs: Vec<libp2p::Multiaddr>,
    bootstrap_addrs: Vec<libp2p::Multiaddr>,
}

impl PeerBootstrapper for BffPeerBootstrap {
    fn identity_path(&self) -> &std::path::Path {
        // Shared identity path for the optional BFF peer.
        static PATH: once_cell::sync::Lazy<std::path::PathBuf> =
            once_cell::sync::Lazy::new(|| soma_net::default_identity_path("bff"));
        &PATH
    }

    fn build_config(&self, _identity: &soma_net::NetIdentity) -> PeerConfig {
        let mut config = PeerConfig::with_identity("bff");
        config.listen_addrs = self.listen_addrs.clone();
        config.bootstrap_addrs = self.bootstrap_addrs.clone();
        config
    }
}
