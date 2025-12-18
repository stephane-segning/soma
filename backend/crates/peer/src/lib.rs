use std::collections::HashSet;
use std::path::PathBuf;
use std::time::Duration;

use futures::StreamExt;
use libp2p::{
    Multiaddr, PeerId, identify, mdns, ping, relay, rendezvous,
    swarm::{NetworkBehaviour, SwarmEvent, behaviour::toggle},
};
use soma_core::SomaResult;
use soma_net::{NetIdentity, build_swarm, default_identity_path};
use tokio::{sync::mpsc, task::JoinHandle};
use tracing::{info, warn};

/// Common peer configuration shared by daemon/bot/bff peers.
#[derive(Debug, Clone)]
pub struct PeerConfig {
    pub identity_path: PathBuf,
    pub listen_addrs: Vec<Multiaddr>,
    pub bootstrap_addrs: Vec<Multiaddr>,
    pub rendezvous_nodes: Vec<Multiaddr>,
    pub relay_addrs: Vec<Multiaddr>,
    pub rendezvous_namespace: Option<String>,
    pub enable_mdns: bool,
}

impl PeerConfig {
    pub fn new(identity_path: PathBuf) -> Self {
        Self {
            identity_path,
            listen_addrs: Vec::new(),
            bootstrap_addrs: Vec::new(),
            rendezvous_nodes: Vec::new(),
            relay_addrs: Vec::new(),
            rendezvous_namespace: Some("soma".to_string()),
            enable_mdns: true,
        }
    }

    pub fn with_identity(service: &str) -> Self {
        Self::new(default_identity_path(service))
    }
}

/// Commands sent to the peer runtime.
#[derive(Debug)]
pub enum PeerCommand {
    Dial(Multiaddr),
    AddBootstrap(Multiaddr),
    Shutdown,
}

/// Events emitted by the peer runtime for logging/metrics.
#[derive(Debug)]
pub enum PeerEvent {
    NewListenAddr {
        address: Multiaddr,
        peer_id: PeerId,
    },
    ListenerClosed {
        reason: String,
    },
    ConnectionEstablished {
        peer: PeerId,
    },
    ConnectionError {
        peer: Option<PeerId>,
        error: String,
    },
    PingOk {
        rtt: Duration,
    },
    PingErr {
        error: String,
    },
    IdentifyReceived {
        peer: PeerId,
        agent: String,
        protocols: usize,
    },
    MdnsDiscovered {
        peers: usize,
    },
    RendezvousDiscovered {
        registrations: usize,
    },
    RelayReserved {
        relay: PeerId,
    },
    RelayCircuitEstablished {
        relay: PeerId,
    },
}

/// Handle to a running peer.
#[derive(Debug)]
pub struct PeerHandle {
    pub peer_id: PeerId,
    pub commands: mpsc::Sender<PeerCommand>,
    pub events: mpsc::Receiver<PeerEvent>,
    pub task: JoinHandle<SomaResult<()>>,
}

/// Spawn a peer with ping + identify + optional mdns + rendezvous discovery.
pub fn spawn_peer(mut config: PeerConfig) -> SomaResult<PeerHandle> {
    let (command_tx, command_rx) = mpsc::channel(16);
    let (event_tx, event_rx) = mpsc::channel(64);
    let identity_path = config.identity_path.clone();

    let task = tokio::spawn(async move {
        let identity = NetIdentity::load_or_generate(&config.identity_path)?;
        let peer_id = identity.peer_id();

        let mdns_behaviour = if config.enable_mdns {
            Some(mdns::tokio::Behaviour::new(
                mdns::Config::default(),
                peer_id,
            )?)
        } else {
            None
        };

        let (_relay_transport, relay_client) = relay::client::new(peer_id);

        let behaviour = AppBehaviour {
            ping: ping::Behaviour::default(),
            identify: identify::Behaviour::new(identify::Config::new(
                "/soma/0.1.0".into(),
                identity.keypair().public().clone(),
            )),
            mdns: mdns_behaviour.into(),
            rendezvous: rendezvous::client::Behaviour::new(
                identity
                    .keypair()
                    .clone()
                    .try_into()
                    .expect("to libp2p_identity keypair"),
            ),
            relay_client,
        };

        let mut swarm = build_swarm(identity.keypair().clone(), behaviour).await?;
        let mut rendezvous_peers = HashSet::new();

        for addr in config.listen_addrs.drain(..) {
            if let Err(err) = swarm.listen_on(addr.clone()) {
                warn!(?err, ?addr, "failed to listen");
            }
        }

        for addr in &config.bootstrap_addrs {
            if let Err(err) = swarm.dial(addr.clone()) {
                warn!(?err, ?addr, "failed to dial bootstrap");
            }
        }

        // Pre-dial rendezvous nodes and remember their peer IDs.
        for addr in &config.rendezvous_nodes {
            if let Some(peer_id) = extract_peer_id(addr) {
                rendezvous_peers.insert(peer_id);
            }
            if let Err(err) = swarm.dial(addr.clone()) {
                warn!(?err, ?addr, "failed to dial rendezvous node");
            }
        }

        run_swarm(
            peer_id,
            config.rendezvous_namespace.unwrap_or_else(|| "soma".into()),
            config.relay_addrs,
            rendezvous_peers,
            swarm,
            command_rx,
            event_tx,
        )
        .await
    });

    let identity = NetIdentity::load_or_generate(&identity_path)?;

    Ok(PeerHandle {
        peer_id: identity.peer_id(),
        commands: command_tx,
        events: event_rx,
        task,
    })
}

/// Backwards-compatible helper for callers expecting the older ping-only API.
pub fn spawn_ping_peer(config: PeerConfig) -> SomaResult<PeerHandle> {
    spawn_peer(config)
}

#[derive(NetworkBehaviour)]
#[behaviour(out_event = "AppEvent")]
struct AppBehaviour {
    ping: ping::Behaviour,
    identify: identify::Behaviour,
    mdns: toggle::Toggle<mdns::tokio::Behaviour>,
    rendezvous: rendezvous::client::Behaviour,
    relay_client: relay::client::Behaviour,
}

#[derive(Debug)]
enum AppEvent {
    Ping(ping::Event),
    Identify(identify::Event),
    Mdns(mdns::Event),
    Rendezvous(rendezvous::client::Event),
    Relay(relay::client::Event),
}

impl From<ping::Event> for AppEvent {
    fn from(event: ping::Event) -> Self {
        AppEvent::Ping(event)
    }
}

impl From<identify::Event> for AppEvent {
    fn from(event: identify::Event) -> Self {
        AppEvent::Identify(event)
    }
}

impl From<mdns::Event> for AppEvent {
    fn from(event: mdns::Event) -> Self {
        AppEvent::Mdns(event)
    }
}

impl From<rendezvous::client::Event> for AppEvent {
    fn from(event: rendezvous::client::Event) -> Self {
        AppEvent::Rendezvous(event)
    }
}

impl From<relay::client::Event> for AppEvent {
    fn from(event: relay::client::Event) -> Self {
        AppEvent::Relay(event)
    }
}

async fn run_swarm(
    peer_id: PeerId,
    rendezvous_namespace: String,
    relay_addrs: Vec<Multiaddr>,
    mut rendezvous_peers: HashSet<PeerId>,
    mut swarm: libp2p::Swarm<AppBehaviour>,
    mut command_rx: mpsc::Receiver<PeerCommand>,
    event_tx: mpsc::Sender<PeerEvent>,
) -> SomaResult<()> {
    for addr in relay_addrs {
        if let Some(peer_id) = extract_peer_id(&addr) {
            // Track relay peers so we can request reservation on connect.
            rendezvous_peers.insert(peer_id);
        }
        let _ = swarm.dial(addr.clone());
    }

    loop {
        tokio::select! {
            Some(cmd) = command_rx.recv() => {
                match cmd {
                    PeerCommand::Dial(addr) | PeerCommand::AddBootstrap(addr) => {
                        if let Err(err) = swarm.dial(addr.clone()) {
                            warn!(?err, ?addr, "failed to dial requested addr");
                        }
                    }
                    PeerCommand::Shutdown => {
                        info!("peer shutdown requested");
                        break;
                    }
                }
            }
            event = swarm.select_next_some() => {
                match event {
                    SwarmEvent::NewListenAddr { address, .. } => {
                        // Treat listen addrs as external so rendezvous register works locally.
                        swarm.add_external_address(address.clone());
                        let _ = event_tx.try_send(PeerEvent::NewListenAddr { address: address.clone(), peer_id });
                    }
                    SwarmEvent::ListenerClosed { reason, .. } => {
                        let msg = format!("{reason:?}");
                        let _ = event_tx.try_send(PeerEvent::ListenerClosed { reason: msg });
                    }
                    SwarmEvent::IncomingConnection { .. } => {}
                    SwarmEvent::OutgoingConnectionError { peer_id: failed_peer, error, .. } => {
                        let _ = event_tx.try_send(PeerEvent::ConnectionError { peer: failed_peer, error: error.to_string() });
                    }
                    SwarmEvent::ConnectionClosed { peer_id: closed_peer, .. } => {
                        let _ = event_tx.try_send(PeerEvent::ConnectionError { peer: Some(closed_peer), error: "closed".into() });
                    }
                    SwarmEvent::ConnectionEstablished { peer_id: remote, .. } => {
                        let _ = event_tx.try_send(PeerEvent::ConnectionEstablished { peer: remote });

                        if rendezvous_peers.contains(&remote) {
                            let namespace = rendezvous::Namespace::new(rendezvous_namespace.clone())
                                .unwrap_or_else(|_| rendezvous::Namespace::from_static("soma"));

                            if let Err(err) = swarm.behaviour_mut().rendezvous.register(namespace.clone(), remote, None) {
                                warn!(?err, "rendezvous register failed");
                            } else {
                                swarm.behaviour_mut().rendezvous.discover(
                                    Some(namespace),
                                    None,
                                    None,
                                    remote,
                                );
                            }
                        }
                    }
                    SwarmEvent::Behaviour(AppEvent::Ping(ping::Event { result, .. })) => {
                        match result {
                            Ok(rtt) => {
                                let _ = event_tx.try_send(PeerEvent::PingOk { rtt });
                            }
                            Err(err) => {
                                let _ = event_tx.try_send(PeerEvent::PingErr { error: format!("{err}") });
                            }
                        }
                    }
                    SwarmEvent::Behaviour(AppEvent::Relay(relay::client::Event::ReservationReqAccepted { relay_peer_id, .. })) => {
                        let _ = event_tx.try_send(PeerEvent::RelayReserved { relay: relay_peer_id });
                    }
                    SwarmEvent::Behaviour(AppEvent::Relay(relay::client::Event::OutboundCircuitEstablished { relay_peer_id, .. })) => {
                        let _ = event_tx.try_send(PeerEvent::RelayCircuitEstablished { relay: relay_peer_id });
                    }
                    SwarmEvent::Behaviour(AppEvent::Relay(_)) => {}
                    SwarmEvent::Behaviour(AppEvent::Identify(identify::Event::Received { peer_id, info, .. })) => {
                        let agent = info.agent_version;
                        let _ = event_tx.try_send(PeerEvent::IdentifyReceived { peer: peer_id, agent, protocols: info.protocols.len() });
                    }
                    SwarmEvent::Behaviour(AppEvent::Identify(_)) => {}
                    SwarmEvent::Behaviour(AppEvent::Mdns(mdns::Event::Discovered(list))) => {
                        for (_peer, addr) in &list {
                            let _ = swarm.dial(addr.clone());
                        }
                        let _ = event_tx.try_send(PeerEvent::MdnsDiscovered { peers: list.len() });
                    }
                    SwarmEvent::Behaviour(AppEvent::Mdns(_)) => {}
                    SwarmEvent::Behaviour(AppEvent::Rendezvous(rendezvous::client::Event::Discovered { registrations, .. })) => {
                        let mut total = 0;
                        for registration in registrations {
                            total += 1;
                            for addr in registration.record.addresses() {
                                let _ = swarm.dial(addr.clone());
                            }
                        }
                        let _ = event_tx.try_send(PeerEvent::RendezvousDiscovered { registrations: total });
                    }
                    SwarmEvent::Behaviour(AppEvent::Rendezvous(evt)) => {
                        // Surface register/discover failures as connection errors for now.
                        match evt {
                            rendezvous::client::Event::DiscoverFailed { rendezvous_node, error, .. } |
                            rendezvous::client::Event::RegisterFailed { rendezvous_node, error, .. } => {
                                let _ = event_tx.try_send(PeerEvent::ConnectionError { peer: Some(rendezvous_node), error: format!("rendezvous error: {error:?}") });
                            }
                            _ => {}
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    Ok(())
}

fn extract_peer_id(addr: &Multiaddr) -> Option<PeerId> {
    addr.iter()
        .filter_map(|p| match p {
            libp2p::multiaddr::Protocol::P2p(peer_id) => Some(peer_id),
            _ => None,
        })
        .last()
}
