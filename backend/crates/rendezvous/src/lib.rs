use std::path::PathBuf;

use futures::StreamExt;
use libp2p::{
    multiaddr::Protocol,
    rendezvous::server,
    swarm::{NetworkBehaviour, SwarmEvent},
    Multiaddr,
};
use soma_core::SomaResult;
use soma_net::{build_swarm, default_identity_path, NetIdentity};
use tokio::signal;
use tracing::{error, info, warn};

/// Configuration for the rendezvous service runtime.
#[derive(Debug, Clone)]
pub struct RendezvousConfig {
    /// Location where the libp2p identity key is persisted.
    pub identity_path: PathBuf,
    /// Listen addresses for the rendezvous swarm.
    pub listen_addrs: Vec<Multiaddr>,
}

impl Default for RendezvousConfig {
    fn default() -> Self {
        Self {
            identity_path: default_identity_path("rendezvous"),
            listen_addrs: vec![
                "/ip4/0.0.0.0/udp/4002/quic-v1"
                    .parse()
                    .expect("valid multiaddr"),
            ],
        }
    }
}

#[derive(NetworkBehaviour)]
#[behaviour(to_swarm = "server::Event")]
struct RendezvousBehaviour {
    rendezvous: server::Behaviour,
}

/// Entry point for the rendezvous service logic.
pub async fn run(config: RendezvousConfig) -> SomaResult<()> {
    let RendezvousConfig {
        identity_path,
        listen_addrs,
    } = config;

    let identity = NetIdentity::load_or_generate(&identity_path)?;
    let peer_id = identity.peer_id();

    let behaviour = RendezvousBehaviour {
        rendezvous: server::Behaviour::new(Default::default()),
    };

    let mut swarm = build_swarm(identity.keypair().clone(), behaviour)?;

    for addr in listen_addrs {
        if let Err(err) = swarm.listen_on(addr) {
            error!(?err, "failed to listen");
        }
    }

    info!(%peer_id, "rendezvous service started");

    loop {
        tokio::select! {
            _ = signal::ctrl_c() => {
                warn!("rendezvous shutdown requested");
                break;
            }
            event = swarm.select_next_some() => {
                match event {
                    SwarmEvent::NewListenAddr { address, .. } => {
                        let p2p = address.clone().with(Protocol::P2p(peer_id.into()));
                        info!(listen_addr=%address, p2p=%p2p, "rendezvous listening");
                    }
                    SwarmEvent::ListenerClosed { reason, .. } => {
                        warn!(?reason, "rendezvous listener closed");
                    }
                    SwarmEvent::Behaviour(server::Event::DiscoverServed { enquirer, registrations }) => {
                        info!(%enquirer, registrations=%registrations.len(), "served rendezvous discover");
                    }
                    SwarmEvent::Behaviour(server::Event::DiscoverNotServed { enquirer, error }) => {
                        warn!(%enquirer, ?error, "failed rendezvous discover");
                    }
                    SwarmEvent::Behaviour(server::Event::PeerRegistered { peer, registration }) => {
                        info!(%peer, registration=?registration, "peer registered");
                    }
                    SwarmEvent::Behaviour(server::Event::PeerNotRegistered { peer, namespace, error }) => {
                        warn!(%peer, ?namespace, ?error, "peer not registered");
                    }
                    SwarmEvent::Behaviour(server::Event::PeerUnregistered { peer, namespace }) => {
                        info!(%peer, ?namespace, "peer unregistered");
                    }
                    SwarmEvent::Behaviour(server::Event::RegistrationExpired(reg)) => {
                        warn!(registration=?reg, "registration expired");
                    }
                    _ => {}
                }
            }
        }
    }

    Ok(())
}
