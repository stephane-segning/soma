use std::path::PathBuf;

use futures::StreamExt;
use libp2p::{
    multiaddr::Protocol,
    relay,
    swarm::{NetworkBehaviour, SwarmEvent},
    Multiaddr,
};
use soma_core::SomaResult;
use soma_net::{build_swarm, default_identity_path, NetIdentity};
use tokio::signal;
use tracing::{error, info, warn};

/// Configuration for the relay service runtime.
#[derive(Debug, Clone)]
pub struct RelayConfig {
    /// Location where the libp2p identity key is persisted.
    pub identity_path: PathBuf,
    /// Listen addresses for the relay swarm.
    pub listen_addrs: Vec<Multiaddr>,
}

impl Default for RelayConfig {
    fn default() -> Self {
        Self {
            identity_path: default_identity_path("relay"),
            listen_addrs: vec![
                "/ip4/0.0.0.0/udp/4001/quic-v1"
                    .parse()
                    .expect("valid multiaddr"),
            ],
        }
    }
}

#[derive(NetworkBehaviour)]
#[behaviour(to_swarm = "relay::Event")]
struct RelayBehaviour {
    relay: relay::Behaviour,
}

/// Entry point for the relay service logic.
pub async fn run(config: RelayConfig) -> SomaResult<()> {
    let RelayConfig {
        identity_path,
        listen_addrs,
    } = config;

    let identity = NetIdentity::load_or_generate(&identity_path)?;
    let peer_id = identity.peer_id();

    let behaviour = RelayBehaviour {
        relay: relay::Behaviour::new(peer_id, Default::default()),
    };

    let mut swarm = build_swarm(identity.keypair().clone(), behaviour)?;

    for addr in listen_addrs {
        if let Err(err) = swarm.listen_on(addr) {
            error!(?err, "failed to listen");
        }
    }

    info!(%peer_id, "relay service started");

    loop {
        tokio::select! {
            _ = signal::ctrl_c() => {
                warn!("relay shutdown requested");
                break;
            }
            event = swarm.select_next_some() => {
                match event {
                    SwarmEvent::NewListenAddr { address, .. } => {
                        let p2p = address.clone().with(Protocol::P2p(peer_id.into()));
                        info!(listen_addr=%address, p2p=%p2p, "relay listening");
                    }
                    SwarmEvent::ListenerClosed { reason, .. } => {
                        warn!(?reason, "relay listener closed");
                    }
                    SwarmEvent::Behaviour(relay::Event::ReservationReqAccepted { src_peer_id, .. }) => {
                        info!(%src_peer_id, "relay reservation accepted");
                    }
                    SwarmEvent::Behaviour(relay::Event::ReservationReqDenied { src_peer_id, status }) => {
                        warn!(%src_peer_id, ?status, "relay reservation denied");
                    }
                    SwarmEvent::Behaviour(relay::Event::ReservationTimedOut { src_peer_id, .. }) => {
                        warn!(%src_peer_id, "relay reservation timed out");
                    }
                    SwarmEvent::Behaviour(relay::Event::CircuitReqAccepted { src_peer_id, .. }) => {
                        info!(%src_peer_id, "relay circuit accepted");
                    }
                    SwarmEvent::Behaviour(relay::Event::CircuitReqDenied { src_peer_id, dst_peer_id, status }) => {
                        warn!(%src_peer_id, %dst_peer_id, ?status, "relay circuit denied");
                    }
                    _ => {}
                }
            }
        }
    }

    Ok(())
}
