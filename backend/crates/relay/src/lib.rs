use std::path::PathBuf;

use futures::StreamExt;
use libp2p::{
    multiaddr::Protocol,
    relay,
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
                "/ip4/0.0.0.0/tcp/4003".parse().expect("valid multiaddr"),
                "/ip4/0.0.0.0/tcp/4003/ws".parse().expect("valid multiaddr"),
                "/ip4/0.0.0.0/udp/4003/quic-v1".parse().expect("valid multiaddr"),
            ],
        }
    }
}

#[derive(Clone, Debug, EncodeLabelSet, Hash, PartialEq, Eq)]
struct ReservationLabels {
    result: &'static str,
    status: Option<String>,
}

#[derive(Clone, Debug, EncodeLabelSet, Hash, PartialEq, Eq)]
struct CircuitLabels {
    result: &'static str,
    status: Option<String>,
}

#[derive(Clone)]
pub struct RelayMetrics {
    registry: SharedRegistry,
    reservations: Family<ReservationLabels, Counter>,
    circuits: Family<CircuitLabels, Counter>,
    listeners: Family<(), Counter>,
}

impl RelayMetrics {
    pub fn new() -> Self {
        let mut registry = prometheus_client::registry::Registry::with_prefix("relay");

        let reservations = Family::<ReservationLabels, Counter>::default();
        registry.register(
            "reservations_total",
            "Relay reservation requests by result",
            reservations.clone(),
        );

        let circuits = Family::<CircuitLabels, Counter>::default();
        registry.register(
            "circuits_total",
            "Relay circuit requests by result",
            circuits.clone(),
        );

        let listeners = Family::<(), Counter>::default();
        registry.register("listen_events_total", "Relay listen events", listeners.clone());

        Self {
            registry: std::sync::Arc::new(registry),
            reservations,
            circuits,
            listeners,
        }
    }

    pub fn registry(&self) -> SharedRegistry {
        self.registry.clone()
    }
}

#[derive(NetworkBehaviour)]
#[behaviour(to_swarm = "relay::Event")]
struct RelayBehaviour {
    relay: relay::Behaviour,
}

/// Entry point for the relay service logic.
pub async fn run(config: RelayConfig, metrics: RelayMetrics) -> SomaResult<()> {
    run_with_shutdown(config, metrics, async {
        signal::ctrl_c().await.ok();
    })
    .await
}

pub async fn run_with_shutdown<F>(config: RelayConfig, metrics: RelayMetrics, shutdown: F) -> SomaResult<()>
where
    F: std::future::Future<Output = ()> + Send,
{
    let RelayConfig {
        identity_path,
        listen_addrs,
    } = config;

    let identity = NetIdentity::load_or_generate(&identity_path)?;
    let peer_id = identity.peer_id();

    let behaviour = RelayBehaviour {
        relay: relay::Behaviour::new(peer_id, Default::default()),
    };

    let mut swarm = build_swarm(identity.keypair().clone(), behaviour).await?;

    for addr in listen_addrs {
        if let Err(err) = swarm.listen_on(addr) {
            error!(?err, "failed to listen");
        }
    }

    info!(%peer_id, "relay service started");

    let mut shutdown = std::pin::pin!(shutdown);
    loop {
        tokio::select! {
            _ = &mut shutdown => {
                warn!("relay shutdown requested");
                break;
            }
            event = swarm.select_next_some() => {
                match event {
                    SwarmEvent::NewListenAddr { address, .. } => {
                        metrics.listeners.get_or_create(&()).inc();
                        let p2p = address.clone().with(Protocol::P2p(peer_id.into()));
                        info!(listen_addr=%address, p2p=%p2p, "relay listening");
                    }
                    SwarmEvent::ListenerClosed { reason, .. } => {
                        warn!(?reason, "relay listener closed");
                    }
                    SwarmEvent::Behaviour(relay::Event::ReservationReqAccepted { src_peer_id, .. }) => {
                        metrics.reservations.get_or_create(&ReservationLabels { result: "accepted", status: None }).inc();
                        info!(%src_peer_id, "relay reservation accepted");
                    }
                    SwarmEvent::Behaviour(relay::Event::ReservationReqDenied { src_peer_id, status }) => {
                        metrics.reservations.get_or_create(&ReservationLabels { result: "denied", status: Some(format!("{status:?}")) }).inc();
                        warn!(%src_peer_id, ?status, "relay reservation denied");
                    }
                    SwarmEvent::Behaviour(relay::Event::ReservationTimedOut { src_peer_id, .. }) => {
                        metrics.reservations.get_or_create(&ReservationLabels { result: "timed_out", status: None }).inc();
                        warn!(%src_peer_id, "relay reservation timed out");
                    }
                    SwarmEvent::Behaviour(relay::Event::CircuitReqAccepted { src_peer_id, .. }) => {
                        metrics.circuits.get_or_create(&CircuitLabels { result: "accepted", status: None }).inc();
                        info!(%src_peer_id, "relay circuit accepted");
                    }
                    SwarmEvent::Behaviour(relay::Event::CircuitReqDenied { src_peer_id, dst_peer_id, status }) => {
                        metrics.circuits.get_or_create(&CircuitLabels { result: "denied", status: Some(format!("{status:?}")) }).inc();
                        warn!(%src_peer_id, %dst_peer_id, ?status, "relay circuit denied");
                    }
                    _ => {}
                }
            }
        }
    }

    Ok(())
}

/// Build a metrics router for the relay service.
pub fn metrics_router(metrics: &RelayMetrics) -> axum::Router {
    router_with_registry(metrics.registry())
}
