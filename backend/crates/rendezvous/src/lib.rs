use std::path::PathBuf;

use futures::StreamExt;
use libp2p::{
    multiaddr::Protocol,
    rendezvous::server,
    swarm::{NetworkBehaviour, SwarmEvent},
    Multiaddr,
};
use prometheus_client::metrics::{counter::Counter, family::Family};
use prometheus_client_derive_encode::EncodeLabelSet;
use soma_core::SomaResult;
use soma_metrics::{router_with_registry, SharedRegistry};
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
                "/ip4/0.0.0.0/tcp/4002".parse().expect("valid multiaddr"),
                "/ip4/0.0.0.0/tcp/4004/ws".parse().expect("valid multiaddr"),
                "/ip4/0.0.0.0/tcp/4004/quic-v1".parse().expect("valid multiaddr"),
            ],
        }
    }
}

#[derive(Clone, Debug, EncodeLabelSet, Hash, PartialEq, Eq)]
struct DiscoverLabels {
    result: &'static str,
}

#[derive(Clone, Debug, EncodeLabelSet, Hash, PartialEq, Eq)]
struct RegistrationLabels {
    result: &'static str,
}

#[derive(Clone)]
pub struct RendezvousMetrics {
    registry: SharedRegistry,
    discovers: Family<DiscoverLabels, Counter>,
    registrations: Family<RegistrationLabels, Counter>,
    listeners: Family<(), Counter>,
}

impl RendezvousMetrics {
    pub fn new() -> Self {
        let mut registry = prometheus_client::registry::Registry::with_prefix("rendezvous");

        let discovers = Family::<DiscoverLabels, Counter>::default();
        registry.register(
            "discover_total",
            "Rendezvous discover requests by result",
            discovers.clone(),
        );

        let registrations = Family::<RegistrationLabels, Counter>::default();
        registry.register(
            "registrations_total",
            "Rendezvous registrations by result",
            registrations.clone(),
        );

        let listeners = Family::<(), Counter>::default();
        registry.register("listen_events_total", "Rendezvous listen events", listeners.clone());

        Self {
            registry: std::sync::Arc::new(registry),
            discovers,
            registrations,
            listeners,
        }
    }

    pub fn registry(&self) -> SharedRegistry {
        self.registry.clone()
    }
}

#[derive(NetworkBehaviour)]
#[behaviour(to_swarm = "server::Event")]
struct RendezvousBehaviour {
    rendezvous: server::Behaviour,
}

/// Entry point for the rendezvous service logic.
pub async fn run(config: RendezvousConfig, metrics: RendezvousMetrics) -> SomaResult<()> {
    let RendezvousConfig {
        identity_path,
        listen_addrs,
    } = config;

    let identity = NetIdentity::load_or_generate(&identity_path)?;
    let peer_id = identity.peer_id();

    let behaviour = RendezvousBehaviour {
        rendezvous: server::Behaviour::new(Default::default()),
    };

    let mut swarm = build_swarm(identity.keypair().clone(), behaviour).await?;

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
                        metrics.listeners.get_or_create(&()).inc();
                        let p2p = address.clone().with(Protocol::P2p(peer_id.into()));
                        info!(listen_addr=%address, p2p=%p2p, "rendezvous listening");
                    }
                    SwarmEvent::ListenerClosed { reason, .. } => {
                        warn!(?reason, "rendezvous listener closed");
                    }
                    SwarmEvent::Behaviour(server::Event::DiscoverServed { enquirer, registrations }) => {
                        metrics.discovers.get_or_create(&DiscoverLabels { result: "served" }).inc();
                        info!(%enquirer, registrations=%registrations.len(), "served rendezvous discover");
                    }
                    SwarmEvent::Behaviour(server::Event::DiscoverNotServed { enquirer, error }) => {
                        metrics.discovers.get_or_create(&DiscoverLabels { result: "not_served" }).inc();
                        warn!(%enquirer, ?error, "failed rendezvous discover");
                    }
                    SwarmEvent::Behaviour(server::Event::PeerRegistered { peer, .. }) => {
                        metrics.registrations.get_or_create(&RegistrationLabels { result: "registered" }).inc();
                        info!(%peer, "peer registered");
                    }
                    SwarmEvent::Behaviour(server::Event::PeerNotRegistered { peer, .. }) => {
                        metrics.registrations.get_or_create(&RegistrationLabels { result: "rejected" }).inc();
                        warn!(%peer, "peer not registered");
                    }
                    SwarmEvent::Behaviour(server::Event::PeerUnregistered { peer, .. }) => {
                        metrics.registrations.get_or_create(&RegistrationLabels { result: "unregistered" }).inc();
                        info!(%peer, "peer unregistered");
                    }
                    SwarmEvent::Behaviour(server::Event::RegistrationExpired(_)) => {
                        metrics.registrations.get_or_create(&RegistrationLabels { result: "expired" }).inc();
                        warn!("registration expired");
                    }
                    _ => {}
                }
            }
        }
    }

    Ok(())
}

/// Build a metrics router for the rendezvous service.
pub fn metrics_router(metrics: &RendezvousMetrics) -> axum::Router {
    router_with_registry(metrics.registry())
}
