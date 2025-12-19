use crate::join::JoinDecider;
use async_trait::async_trait;
pub use config::{PeerConfig, PeerConfigBuilder};
use futures::{StreamExt, prelude::*};
use libp2p::{
    Multiaddr, PeerId, identify, identity, mdns,
    multiaddr::Protocol,
    ping, relay, rendezvous, request_response as reqres,
    swarm::{NetworkBehaviour, SwarmEvent, behaviour::toggle},
};
use prost::Message;
use soma_core::SomaResult;
use soma_net::NetIdentity;
use soma_proto_build::spaceroom;
use std::collections::{HashMap, HashSet};
use std::io;
use std::sync::Arc;
use std::time::Duration;
use tokio::{sync::mpsc, task::JoinHandle};
use tracing::{info, warn};

mod config;
pub mod events;
mod join;
mod transport;

const JOIN_PROTOCOL: &str = "/soma/join/1";
const MAX_JOIN_MESSAGE_BYTES: usize = 16 * 1024;
const AGENT_PROTOCOL: &str = "/soma/0.1.0";

/// Commands sent to the peer runtime.
#[derive(Debug)]
pub enum PeerCommand {
    Dial(Multiaddr),
    AddBootstrap(Multiaddr),
    SendJoinRequest {
        target: PeerId,
        addrs: Vec<Multiaddr>,
        request_id: String,
        request: spaceroom::JoinRequest,
    },
    Shutdown,
}

/// Events emitted by the peer runtime for logging/metrics.
#[derive(Debug, Clone)]
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
    JoinRequestSubmitted {
        target: PeerId,
        request_id: String,
    },
    JoinDecision {
        from: PeerId,
        decision: spaceroom::JoinDecision,
    },
    JoinFailed {
        target: PeerId,
        error: String,
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

        let enable_mdns = config.enable_mdns;
        let join_decider = config.join_decider.clone();
        let keypair = identity.keypair().clone();
        let mut swarm = transport::build_peer_swarm(keypair, move |keypair, relay_client| {
            build_app_behaviour(enable_mdns, keypair, relay_client)
        })
        .await?;
        let mut rendezvous_peers = HashSet::new();
        let mut relay_peers = HashMap::new();

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

        // Pre-dial relay nodes and remember their peer IDs.
        for addr in &config.relay_addrs {
            if let Some(peer_id) = extract_peer_id(addr) {
                relay_peers.insert(peer_id, addr.clone());
            }
            if let Err(err) = swarm.dial(addr.clone()) {
                warn!(?err, ?addr, "failed to dial relay node");
            }
        }

        run_swarm(
            peer_id,
            config.rendezvous_namespace.unwrap_or_else(|| "soma".into()),
            config.relay_addrs,
            rendezvous_peers,
            relay_peers,
            join_decider.clone(),
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

fn build_app_behaviour(
    enable_mdns: bool,
    keypair: identity::Keypair,
    relay_client: relay::client::Behaviour,
) -> AppBehaviour {
    let mdns_behaviour = if enable_mdns {
        Some(
            mdns::tokio::Behaviour::new(mdns::Config::default(), keypair.public().to_peer_id())
                .expect("mdns behaviour"),
        )
    } else {
        None
    };

    AppBehaviour {
        ping: ping::Behaviour::default(),
        identify: identify::Behaviour::new(identify::Config::new(
            AGENT_PROTOCOL.into(),
            keypair.public().clone(),
        )),
        mdns: mdns_behaviour.into(),
        rendezvous: rendezvous::client::Behaviour::new(
            keypair.clone().try_into().expect("to libp2p keypair"),
        ),
        relay_client,
        join: build_join_behaviour(),
    }
}

#[derive(NetworkBehaviour)]
#[behaviour(out_event = "AppEvent")]
struct AppBehaviour {
    ping: ping::Behaviour,
    identify: identify::Behaviour,
    mdns: toggle::Toggle<mdns::tokio::Behaviour>,
    rendezvous: rendezvous::client::Behaviour,
    relay_client: relay::client::Behaviour,
    join: reqres::Behaviour<JoinCodec>,
}

#[derive(Debug)]
enum AppEvent {
    Ping(ping::Event),
    Identify(identify::Event),
    Mdns(mdns::Event),
    Rendezvous(rendezvous::client::Event),
    Relay(relay::client::Event),
    Join(reqres::Event<spaceroom::JoinRequest, spaceroom::JoinDecision>),
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

impl From<reqres::Event<spaceroom::JoinRequest, spaceroom::JoinDecision>> for AppEvent {
    fn from(event: reqres::Event<spaceroom::JoinRequest, spaceroom::JoinDecision>) -> Self {
        AppEvent::Join(event)
    }
}

async fn run_swarm(
    peer_id: PeerId,
    rendezvous_namespace: String,
    relay_addrs: Vec<Multiaddr>,
    rendezvous_peers: HashSet<PeerId>,
    mut relay_peers: HashMap<PeerId, Multiaddr>,
    join_decider: Arc<dyn JoinDecider>,
    mut swarm: libp2p::Swarm<AppBehaviour>,
    mut command_rx: mpsc::Receiver<PeerCommand>,
    event_tx: mpsc::Sender<PeerEvent>,
) -> SomaResult<()> {
    for addr in relay_addrs {
        if let Some(peer_id) = extract_peer_id(&addr) {
            relay_peers.entry(peer_id).or_insert(addr.clone());
        }
        let _ = swarm.dial(addr.clone());
    }

    let mut requested_reservations = HashSet::new();

    loop {
        tokio::select! {
            Some(cmd) = command_rx.recv() => {
                match cmd {
                    PeerCommand::Dial(addr) | PeerCommand::AddBootstrap(addr) => {
                        if let Err(err) = swarm.dial(addr.clone()) {
                            warn!(?err, ?addr, "failed to dial requested addr");
                        }
                    }
                    PeerCommand::SendJoinRequest { target, addrs, request_id, request } => {
                        for addr in addrs {
                            swarm.add_peer_address(target, addr.clone());
                            let _ = swarm.dial(addr.clone());
                        }
                        swarm.behaviour_mut().join.send_request(&target, request);
                        let _ = event_tx.try_send(PeerEvent::JoinRequestSubmitted { target, request_id });
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

                        if let Some(relay_addr) = relay_peers.get(&remote) {
                            if requested_reservations.insert(remote) {
                                if let Some(circuit) = relay_circuit_addr(&peer_id, relay_addr) {
                                    if let Err(err) = swarm.listen_on(circuit.clone()) {
                                        warn!(?err, ?circuit, "failed to request relay reservation");
                                    }
                                }
                            }
                        }

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
                    SwarmEvent::Behaviour(AppEvent::Join(evt)) => {
                        match evt {
                            reqres::Event::Message { peer, message, .. } => {
                                match message {
                                    reqres::Message::Request { request, channel, .. } => {
                                        let decider = join_decider.clone();
                                        let response = decider.decide(&request, &peer_id).await;
                                        let _ = swarm.behaviour_mut().join.send_response(channel, response.clone());
                                        let _ = event_tx.try_send(PeerEvent::JoinDecision { from: peer_id, decision: response });
                                    }
                                    reqres::Message::Response { response, .. } => {
                                        let _ = event_tx.try_send(PeerEvent::JoinDecision { from: peer, decision: response });
                                    }
                                }
                            }
                            reqres::Event::OutboundFailure { peer, error, .. } => {
                                let _ = event_tx.try_send(PeerEvent::JoinFailed { target: peer, error: error.to_string() });
                            }
                            reqres::Event::InboundFailure { .. } => {}
                            reqres::Event::ResponseSent { .. } => {}
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

fn relay_circuit_addr(local_peer: &PeerId, relay_addr: &Multiaddr) -> Option<Multiaddr> {
    extract_peer_id(relay_addr).map(|_| {
        let mut addr = relay_addr.clone();
        addr.push(Protocol::P2pCircuit);
        addr.push(Protocol::P2p((*local_peer).into()));
        addr
    })
}

fn build_join_behaviour() -> reqres::Behaviour<JoinCodec> {
    let protocols = std::iter::once((JOIN_PROTOCOL.to_string(), reqres::ProtocolSupport::Full));
    let cfg = reqres::Config::default().with_request_timeout(Duration::from_secs(10));
    reqres::Behaviour::new(protocols, cfg)
}

#[derive(Clone, Default)]
struct JoinCodec;

#[async_trait]
impl reqres::Codec for JoinCodec {
    type Protocol = String;
    type Request = spaceroom::JoinRequest;
    type Response = spaceroom::JoinDecision;

    async fn read_request<T>(
        &mut self,
        _protocol: &Self::Protocol,
        io: &mut T,
    ) -> io::Result<Self::Request>
    where
        T: AsyncRead + Unpin + Send,
    {
        read_message(io).await
    }

    async fn read_response<T>(
        &mut self,
        _protocol: &Self::Protocol,
        io: &mut T,
    ) -> io::Result<Self::Response>
    where
        T: AsyncRead + Unpin + Send,
    {
        read_message(io).await
    }

    async fn write_request<T>(
        &mut self,
        _protocol: &Self::Protocol,
        io: &mut T,
        req: Self::Request,
    ) -> io::Result<()>
    where
        T: AsyncWrite + Unpin + Send,
    {
        write_message(io, req).await
    }

    async fn write_response<T>(
        &mut self,
        _protocol: &Self::Protocol,
        io: &mut T,
        res: Self::Response,
    ) -> io::Result<()>
    where
        T: AsyncWrite + Unpin + Send,
    {
        write_message(io, res).await
    }
}

async fn read_message<M, T>(io: &mut T) -> io::Result<M>
where
    M: Message + Default,
    T: AsyncRead + Unpin + Send,
{
    let mut len_buf = [0u8; 4];
    io.read_exact(&mut len_buf).await?;
    let len = u32::from_be_bytes(len_buf) as usize;
    if len > MAX_JOIN_MESSAGE_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "join message too large",
        ));
    }
    let mut buf = vec![0u8; len];
    io.read_exact(&mut buf).await?;
    M::decode(buf.as_slice()).map_err(|err| io::Error::new(io::ErrorKind::InvalidData, err))
}

async fn write_message<M, T>(io: &mut T, msg: M) -> io::Result<()>
where
    M: Message,
    T: AsyncWrite + Unpin + Send,
{
    let mut buf = Vec::new();
    msg.encode(&mut buf)
        .map_err(|err| io::Error::new(io::ErrorKind::InvalidData, err))?;
    let len = u32::try_from(buf.len()).map_err(|_| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            "join message exceeds u32 length",
        )
    })?;
    io.write_all(&len.to_be_bytes()).await?;
    io.write_all(&buf).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures::io::Cursor;
    use libp2p::request_response::Codec;

    fn sample_request() -> spaceroom::JoinRequest {
        spaceroom::JoinRequest {
            space_id: Some(spaceroom::SpaceId {
                value: "space-123".into(),
            }),
            peer_id: Some(spaceroom::PeerId {
                value: "peer-abc".into(),
            }),
            display_name: "User".into(),
            device_name: "Device".into(),
            student_code: String::new(),
            requested_role: spaceroom::SpaceRole::Student as i32,
            invite_proof: None,
            created_at: None,
        }
    }

    #[tokio::test]
    async fn join_codec_roundtrip() {
        let mut codec = JoinCodec;
        let mut buf = Cursor::new(Vec::new());
        let req = sample_request();
        let proto = JOIN_PROTOCOL.to_string();

        codec
            .write_request(&proto, &mut buf, req.clone())
            .await
            .expect("write");
        buf.set_position(0);
        let decoded = codec
            .read_request(&proto, &mut buf)
            .await
            .expect("read back join request");
        assert_eq!(decoded.space_id.unwrap().value, "space-123");
        assert_eq!(decoded.peer_id.unwrap().value, "peer-abc");
    }

    #[tokio::test]
    async fn join_codec_rejects_oversized() {
        let mut codec = JoinCodec;
        let mut buf = Cursor::new(Vec::new());
        let mut req = sample_request();
        req.display_name = "x".repeat(MAX_JOIN_MESSAGE_BYTES + 1);
        let proto = JOIN_PROTOCOL.to_string();
        codec
            .write_request(&proto, &mut buf, req)
            .await
            .expect("write oversized");
        buf.set_position(0);
        let read_res = codec.read_request(&proto, &mut buf).await;
        assert!(
            read_res.is_err(),
            "oversized message should be rejected on read"
        );
    }

    #[test]
    fn reject_join_sets_rejection() {
        let req = sample_request();
        let peer = PeerId::random();
        let decision = reject_join(&req, peer);
        assert_eq!(
            decision.decision,
            spaceroom::JoinDecisionType::JoinRejected as i32
        );
        assert_eq!(decision.space_id.unwrap().value, "space-123");
        assert_eq!(decision.subject_peer_id.unwrap().value, "peer-abc");
        assert_eq!(decision.reason, "not an issuer");
    }
}
