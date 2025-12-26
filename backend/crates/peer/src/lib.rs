use crate::join::JoinDecider;
use async_trait::async_trait;
pub use config::{PeerConfig, PeerConfigBuilder};
pub mod bootstrap;
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
use soma_vdfs::{
    BLOB_PROTOCOL, BlobProvider, BlobRange, BlobRequest, BlobResponse, BlobWriteInit,
    BlobWriteStream, DEFAULT_BLOB_CHUNK_BYTES, MAX_BLOB_MESSAGE_BYTES,
};
use std::collections::{HashMap, HashSet, hash_map::Entry};
use std::io;
use std::sync::Arc;
use std::time::Duration;
use tokio::{sync::mpsc, task::JoinHandle};
use tracing::{info, warn};

mod config;
pub mod events;
pub mod join;
mod transport;

const JOIN_PROTOCOL: &str = "/soma/join/1";
const JOIN_DECISION_PROTOCOL: &str = "/soma/join-decision/1";
const MAX_JOIN_MESSAGE_BYTES: usize = 16 * 1024;
const MAX_JOIN_DECISION_MESSAGE_BYTES: usize = 64 * 1024;
const AGENT_PROTOCOL: &str = "/soma/0.1.0";
const BLOB_CHUNK_BYTES: usize = DEFAULT_BLOB_CHUNK_BYTES;

/// Commands sent to the peer runtime.
#[derive(Debug)]
pub enum PeerCommand {
    Dial(Multiaddr),
    AddBootstrap(Multiaddr),
    SendJoinRequest {
        target: PeerId,
        addrs: Vec<Multiaddr>,
        delivery_id: String,
        request_id: String,
        request: spaceroom::JoinRequest,
    },
    SendJoinDecision {
        target: PeerId,
        addrs: Vec<Multiaddr>,
        delivery_id: String,
        decision: spaceroom::JoinDecision,
    },
    /// Request to fetch a blob by CID. Results are delivered via events or handlers.
    FetchBlob {
        target: PeerId,
        addrs: Vec<Multiaddr>,
        cid: String,
        space_id: Option<String>,
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
    JoinRequestDeliverySubmitted {
        target: PeerId,
        delivery_id: String,
        request_id: String,
    },
    JoinRequestDeliveryAck {
        target: PeerId,
        delivery_id: String,
        request_id: String,
    },
    JoinRequestDeliveryFailed {
        target: PeerId,
        delivery_id: String,
        request_id: String,
        error: String,
    },
    JoinDecision {
        from: PeerId,
        decision: spaceroom::JoinDecision,
    },
    JoinDecisionDeliverySubmitted {
        target: PeerId,
        delivery_id: String,
    },
    JoinDecisionDeliveryAck {
        target: PeerId,
        delivery_id: String,
    },
    JoinDecisionDeliveryFailed {
        target: PeerId,
        delivery_id: String,
        error: String,
    },
    JoinFailed {
        target: PeerId,
        error: String,
    },
    /// Emitted when a blob tied to Yoopta content is stored locally.
    YooptaBlobAdded {
        space_id: String,
        doc_id: String,
        cid: String,
        mime: String,
        size: u64,
        name: Option<String>,
    },
    /// Emitted when we receive and persist a blob fetched over the network.
    BlobResponseReceived {
        cid: String,
        size: u64,
        found: bool,
        stored: bool,
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

struct BlobDownloadState {
    writer: Box<dyn BlobWriteStream>,
    total_size: u64,
    next_offset: u64,
    chunk_size: u32,
}

/// Spawn a peer with ping + identify + optional mdns + rendezvous discovery.
pub fn spawn_peer(mut config: PeerConfig) -> SomaResult<PeerHandle> {
    let (command_tx, command_rx) = mpsc::channel(16);
    let (event_tx, event_rx) = mpsc::channel(64);
    let identity_path = config.identity_path.clone();
    let blob_provider = config.blob_provider.clone();

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
            blob_provider,
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
        join_decision: build_join_decision_behaviour(),
        blob: build_blob_behaviour(),
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
    join_decision: reqres::Behaviour<JoinDecisionCodec>,
    blob: reqres::Behaviour<BlobCodec>,
}

#[derive(Debug)]
enum AppEvent {
    Ping(ping::Event),
    Identify(identify::Event),
    Mdns(mdns::Event),
    Rendezvous(rendezvous::client::Event),
    Relay(relay::client::Event),
    Join(reqres::Event<spaceroom::JoinRequest, spaceroom::JoinDecision>),
    JoinDecision(reqres::Event<spaceroom::JoinDecision, JoinDecisionAck>),
    Blob(reqres::Event<BlobRequest, BlobResponse>),
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

impl From<reqres::Event<spaceroom::JoinDecision, JoinDecisionAck>> for AppEvent {
    fn from(event: reqres::Event<spaceroom::JoinDecision, JoinDecisionAck>) -> Self {
        AppEvent::JoinDecision(event)
    }
}

impl From<reqres::Event<BlobRequest, BlobResponse>> for AppEvent {
    fn from(event: reqres::Event<BlobRequest, BlobResponse>) -> Self {
        AppEvent::Blob(event)
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
    blob_provider: Option<Arc<dyn BlobProvider>>,
) -> SomaResult<()> {
    for addr in relay_addrs {
        if let Some(peer_id) = extract_peer_id(&addr) {
            relay_peers.entry(peer_id).or_insert(addr.clone());
        }
        let _ = swarm.dial(addr.clone());
    }

    let mut requested_reservations = HashSet::new();
    let mut outbound_join_requests: HashMap<_, (PeerId, String, String)> = HashMap::new();
    let mut outbound_join_decisions: HashMap<_, (PeerId, String)> = HashMap::new();
    let mut blob_downloads: HashMap<(String, String), BlobDownloadState> = HashMap::new();

    loop {
        tokio::select! {
            Some(cmd) = command_rx.recv() => {
                match cmd {
                    PeerCommand::Dial(addr) | PeerCommand::AddBootstrap(addr) => {
                        if let Err(err) = swarm.dial(addr.clone()) {
                            warn!(?err, ?addr, "failed to dial requested addr");
                        }
                    }
                    PeerCommand::SendJoinRequest { target, addrs, delivery_id, request_id, request } => {
                        for addr in addrs {
                            swarm.add_peer_address(target, addr.clone());
                            let _ = swarm.dial(addr.clone());
                        }
                        let req_id = swarm.behaviour_mut().join.send_request(&target, request);
                        outbound_join_requests.insert(req_id, (target, delivery_id.clone(), request_id.clone()));
                        let _ = event_tx.try_send(PeerEvent::JoinRequestSubmitted { target, request_id: request_id.clone() });
                        let _ = event_tx.try_send(PeerEvent::JoinRequestDeliverySubmitted { target, delivery_id, request_id });
                    }
                    PeerCommand::SendJoinDecision { target, addrs, delivery_id, decision } => {
                        for addr in addrs {
                            swarm.add_peer_address(target, addr.clone());
                            let _ = swarm.dial(addr.clone());
                        }
                        let req_id = swarm.behaviour_mut().join_decision.send_request(&target, decision);
                        outbound_join_decisions.insert(req_id, (target, delivery_id.clone()));
                        let _ = event_tx.try_send(PeerEvent::JoinDecisionDeliverySubmitted { target, delivery_id });
                    }
                    PeerCommand::FetchBlob { target, addrs, cid, space_id } => {
                        for addr in addrs {
                            swarm.add_peer_address(target, addr.clone());
                            let _ = swarm.dial(addr.clone());
                        }
                        let mut request = BlobRequest {
                            cid,
                            space_id: String::new(),
                            offset: 0,
                            length: BLOB_CHUNK_BYTES as u32,
                        };
                        if let Some(space) = space_id {
                            request.space_id = space;
                        }
                        let _ = swarm.behaviour_mut().blob.send_request(&target, request);
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
                                    reqres::Message::Response { request_id, response } => {
                                        if let Some((target, delivery_id, client_request_id)) = outbound_join_requests.remove(&request_id) {
                                            let _ = event_tx.try_send(PeerEvent::JoinRequestDeliveryAck { target, delivery_id, request_id: client_request_id });
                                        }
                                        let _ = event_tx.try_send(PeerEvent::JoinDecision { from: peer, decision: response });
                                    }
                                }
                            }
                            reqres::Event::OutboundFailure { peer, request_id, error, .. } => {
                                if let Some((_target, delivery_id, client_request_id)) = outbound_join_requests.remove(&request_id) {
                                    let _ = event_tx.try_send(PeerEvent::JoinRequestDeliveryFailed { target: peer, delivery_id, request_id: client_request_id, error: error.to_string() });
                                }
                                let _ = event_tx.try_send(PeerEvent::JoinFailed { target: peer, error: error.to_string() });
                            }
                            reqres::Event::InboundFailure { .. } => {}
                            reqres::Event::ResponseSent { .. } => {}
                        }
                    }
                    SwarmEvent::Behaviour(AppEvent::JoinDecision(evt)) => {
                        match evt {
                            reqres::Event::Message { peer, message, .. } => {
                                match message {
                                    reqres::Message::Request { request, channel, .. } => {
                                        let _ = swarm.behaviour_mut().join_decision.send_response(channel, JoinDecisionAck {});
                                        let _ = event_tx.try_send(PeerEvent::JoinDecision { from: peer, decision: request });
                                    }
                                    reqres::Message::Response { request_id, .. } => {
                                        if let Some((target, delivery_id)) = outbound_join_decisions.remove(&request_id) {
                                            let _ = event_tx.try_send(PeerEvent::JoinDecisionDeliveryAck { target, delivery_id });
                                        }
                                    }
                                }
                            }
                            reqres::Event::OutboundFailure { peer, request_id, error, .. } => {
                                if let Some((_target, delivery_id)) = outbound_join_decisions.remove(&request_id) {
                                    let _ = event_tx.try_send(PeerEvent::JoinDecisionDeliveryFailed { target: peer, delivery_id, error: error.to_string() });
                                } else {
                                    let _ = event_tx.try_send(PeerEvent::JoinDecisionDeliveryFailed { target: peer, delivery_id: "unknown".into(), error: error.to_string() });
                                }
                            }
                            reqres::Event::InboundFailure { .. } => {}
                            reqres::Event::ResponseSent { .. } => {}
                        }
                    }
                    SwarmEvent::Behaviour(AppEvent::Blob(evt)) => match evt {
                        reqres::Event::Message { peer, message, .. } => match message {
                            reqres::Message::Request { request, channel, .. } => {
                                let requested_len = if request.length == 0 {
                                    BLOB_CHUNK_BYTES
                                } else {
                                    request.length as usize
                                };
                                let clamped_len = requested_len
                                    .min(MAX_BLOB_MESSAGE_BYTES.saturating_sub(1024));
                                let range = BlobRange {
                                    offset: request.offset,
                                    length: Some(clamped_len),
                                };

                                if let Some(provider) = blob_provider.as_ref() {
                                    let res = provider
                                        .get(
                                            &request.cid,
                                            (!request.space_id.is_empty())
                                                .then_some(request.space_id.as_str()),
                                            range,
                                        )
                                        .await;
                                    let response = res.unwrap_or_else(|| BlobResponse {
                                        cid: request.cid,
                                        mime: String::new(),
                                        size: 0,
                                        data: Vec::new(),
                                        found: false,
                                        space_id: request.space_id,
                                        offset: request.offset,
                                        eof: true,
                                    });
                                    let _ = swarm.behaviour_mut().blob.send_response(channel, response);
                                } else {
                                    let response = BlobResponse {
                                        cid: request.cid,
                                        mime: String::new(),
                                        size: 0,
                                        data: Vec::new(),
                                        found: false,
                                        space_id: request.space_id,
                                        offset: request.offset,
                                        eof: true,
                                    };
                                    let _ = swarm.behaviour_mut().blob.send_response(channel, response);
                                    let _ = event_tx.try_send(PeerEvent::ConnectionError {
                                        peer: Some(peer),
                                        error: "blob requested but no provider attached".into(),
                                    });
                                }
                            }
                            reqres::Message::Response { response, .. } => {
                                if !response.found {
                                    let _ = event_tx.try_send(PeerEvent::BlobResponseReceived {
                                        cid: response.cid.clone(),
                                        size: response.size,
                                        found: false,
                                        stored: false,
                                    });
                                    continue;
                                }

                                let space_id = response.space_id.clone();
                                if space_id.is_empty() {
                                    let _ = event_tx.try_send(PeerEvent::ConnectionError {
                                        peer: Some(peer),
                                        error: "blob response missing space_id".into(),
                                    });
                                    let _ = event_tx.try_send(PeerEvent::BlobResponseReceived {
                                        cid: response.cid.clone(),
                                        size: response.size,
                                        found: true,
                                        stored: false,
                                    });
                                    continue;
                                }

                                let chunk_len = response.data.len() as u64;
                                if chunk_len == 0 {
                                    let _ = event_tx.try_send(PeerEvent::ConnectionError {
                                        peer: Some(peer),
                                        error: "blob response with empty chunk".into(),
                                    });
                                    continue;
                                }

                                // Fast path: entire blob fits in one message.
                                let is_single_chunk = response.offset == 0
                                    && chunk_len == response.size
                                    && chunk_len as usize <= MAX_BLOB_MESSAGE_BYTES;

                                if is_single_chunk {
                                    let stored = if let Some(provider) = blob_provider.as_ref() {
                                        match provider
                                            .put(
                                                &response.cid,
                                                Some(space_id.as_str()),
                                                &response.data,
                                                &response.mime,
                                            )
                                            .await
                                        {
                                            Ok(written) => written,
                                            Err(err) => {
                                                let _ = event_tx.try_send(PeerEvent::ConnectionError {
                                                    peer: Some(peer),
                                                    error: format!("blob store failed: {err}"),
                                                });
                                                false
                                            }
                                        }
                                    } else {
                                        false
                                    };
                                    let _ = event_tx.try_send(PeerEvent::BlobResponseReceived {
                                        cid: response.cid.clone(),
                                        size: response.size,
                                        found: true,
                                        stored,
                                    });
                                    continue;
                                }

                                // Streaming path for large blobs.
                                if let Some(provider) = blob_provider.as_ref() {
                                    let key = (space_id.clone(), response.cid.clone());
                                    if let Entry::Vacant(entry) = blob_downloads.entry(key.clone()) {
                                        match provider
                                            .open_streaming_put(
                                                &response.cid,
                                                Some(space_id.as_str()),
                                                response.size,
                                            )
                                            .await
                                        {
                                            Ok(Some(BlobWriteInit::AlreadyPresent)) => {
                                                let _ = event_tx.try_send(PeerEvent::BlobResponseReceived {
                                                    cid: response.cid.clone(),
                                                    size: response.size,
                                                    found: true,
                                                    stored: true,
                                                });
                                                continue;
                                            }
                                            Ok(Some(BlobWriteInit::Started(writer))) => {
                                                entry.insert(BlobDownloadState {
                                                    writer,
                                                    total_size: response.size,
                                                    next_offset: 0,
                                                    chunk_size: BLOB_CHUNK_BYTES as u32,
                                                });
                                            }
                                            Ok(None) => {
                                                let _ = event_tx.try_send(PeerEvent::ConnectionError {
                                                    peer: Some(peer),
                                                    error: "blob provider does not support streaming writes".into(),
                                                });
                                                let _ = event_tx.try_send(PeerEvent::BlobResponseReceived {
                                                    cid: response.cid.clone(),
                                                    size: response.size,
                                                    found: true,
                                                    stored: false,
                                                });
                                                continue;
                                            }
                                            Err(err) => {
                                                let _ = event_tx.try_send(PeerEvent::ConnectionError {
                                                    peer: Some(peer),
                                                    error: format!("failed to begin streaming blob write: {err}"),
                                                });
                                                let _ = event_tx.try_send(PeerEvent::BlobResponseReceived {
                                                    cid: response.cid.clone(),
                                                    size: response.size,
                                                    found: true,
                                                    stored: false,
                                                });
                                                continue;
                                            }
                                        }
                                    }

                                    if let Some(state) = blob_downloads.get_mut(&key) {
                                        if state.next_offset != response.offset {
                                            if let Some(writer) = blob_downloads.remove(&key).map(|s| s.writer) {
                                                let _ = writer.abort().await;
                                            }
                                            let _ = event_tx.try_send(PeerEvent::ConnectionError {
                                                peer: Some(peer),
                                                error: "received out-of-order blob chunk".into(),
                                            });
                                            let _ = event_tx.try_send(PeerEvent::BlobResponseReceived {
                                                cid: response.cid.clone(),
                                                size: response.size,
                                                found: true,
                                                stored: false,
                                            });
                                            continue;
                                        }

                                        if let Err(err) = state.writer.write_chunk(response.offset, &response.data).await {
                                            if let Some(writer) = blob_downloads.remove(&key).map(|s| s.writer) {
                                                let _ = writer.abort().await;
                                            }
                                            let _ = event_tx.try_send(PeerEvent::ConnectionError {
                                                peer: Some(peer),
                                                error: format!("failed to persist blob chunk: {err}"),
                                            });
                                            let _ = event_tx.try_send(PeerEvent::BlobResponseReceived {
                                                cid: response.cid.clone(),
                                                size: response.size,
                                                found: true,
                                                stored: false,
                                            });
                                            continue;
                                        }

                                        state.next_offset += chunk_len;
                                        let done = state.next_offset >= state.total_size || response.eof;
                                        if done {
                                            if let Some(state) = blob_downloads.remove(&key) {
                                                let stored = state.writer.finish().await.unwrap_or(false);
                                                let _ = event_tx.try_send(PeerEvent::BlobResponseReceived {
                                                    cid: response.cid.clone(),
                                                    size: response.size,
                                                    found: true,
                                                    stored,
                                                });
                                            }
                                        } else {
                                            let next_len = state
                                                .chunk_size
                                                .min(MAX_BLOB_MESSAGE_BYTES.saturating_sub(1024) as u32);
                                            let next_request = BlobRequest {
                                                cid: response.cid.clone(),
                                                space_id: space_id.clone(),
                                                offset: state.next_offset,
                                                length: next_len,
                                            };
                                            let _ = swarm.behaviour_mut().blob.send_request(&peer, next_request);
                                        }
                                    }
                                } else {
                                    let _ = event_tx.try_send(PeerEvent::ConnectionError {
                                        peer: Some(peer),
                                        error: "blob response but no provider attached".into(),
                                    });
                                    let _ = event_tx.try_send(PeerEvent::BlobResponseReceived {
                                        cid: response.cid.clone(),
                                        size: response.size,
                                        found: true,
                                        stored: false,
                                    });
                                }
                            }
                        },
                        reqres::Event::OutboundFailure { peer, error, .. } => {
                            let _ = event_tx.try_send(PeerEvent::ConnectionError {
                                peer: Some(peer),
                                error: format!("blob outbound failure: {error}"),
                            });
                        }
                        reqres::Event::InboundFailure { peer, error, .. } => {
                            let _ = event_tx.try_send(PeerEvent::ConnectionError {
                                peer: Some(peer),
                                error: format!("blob inbound failure: {error}"),
                            });
                        }
                        reqres::Event::ResponseSent { .. } => {}
                    },
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

fn build_join_decision_behaviour() -> reqres::Behaviour<JoinDecisionCodec> {
    let protocols = std::iter::once((
        JOIN_DECISION_PROTOCOL.to_string(),
        reqres::ProtocolSupport::Full,
    ));
    let cfg = reqres::Config::default().with_request_timeout(Duration::from_secs(10));
    reqres::Behaviour::new(protocols, cfg)
}

fn build_blob_behaviour() -> reqres::Behaviour<BlobCodec> {
    let protocols = std::iter::once((BLOB_PROTOCOL.to_string(), reqres::ProtocolSupport::Full));
    // Blob transfers may take longer; allow a more generous timeout.
    let cfg = reqres::Config::default().with_request_timeout(Duration::from_secs(30));
    reqres::Behaviour::new(protocols, cfg)
}

#[derive(Clone, Default)]
struct JoinCodec;

#[derive(Clone, Default)]
struct JoinDecisionCodec;

#[derive(Clone, Default)]
struct BlobCodec;

#[derive(Clone, PartialEq, Message)]
struct JoinDecisionAck {}

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

#[async_trait]
impl reqres::Codec for JoinDecisionCodec {
    type Protocol = String;
    type Request = spaceroom::JoinDecision;
    type Response = JoinDecisionAck;

    async fn read_request<T>(
        &mut self,
        _protocol: &Self::Protocol,
        io: &mut T,
    ) -> io::Result<Self::Request>
    where
        T: AsyncRead + Unpin + Send,
    {
        read_message_with_limit(io, MAX_JOIN_DECISION_MESSAGE_BYTES).await
    }

    async fn read_response<T>(
        &mut self,
        _protocol: &Self::Protocol,
        io: &mut T,
    ) -> io::Result<Self::Response>
    where
        T: AsyncRead + Unpin + Send,
    {
        read_message_with_limit(io, MAX_JOIN_DECISION_MESSAGE_BYTES).await
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

#[async_trait]
impl reqres::Codec for BlobCodec {
    type Protocol = String;
    type Request = BlobRequest;
    type Response = BlobResponse;

    async fn read_request<T>(
        &mut self,
        _protocol: &Self::Protocol,
        io: &mut T,
    ) -> io::Result<Self::Request>
    where
        T: AsyncRead + Unpin + Send,
    {
        read_message_with_limit(io, MAX_BLOB_MESSAGE_BYTES).await
    }

    async fn read_response<T>(
        &mut self,
        _protocol: &Self::Protocol,
        io: &mut T,
    ) -> io::Result<Self::Response>
    where
        T: AsyncRead + Unpin + Send,
    {
        read_message_with_limit(io, MAX_BLOB_MESSAGE_BYTES).await
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
    read_message_with_limit(io, MAX_JOIN_MESSAGE_BYTES).await
}

async fn read_message_with_limit<M, T>(io: &mut T, limit: usize) -> io::Result<M>
where
    M: Message + Default,
    T: AsyncRead + Unpin + Send,
{
    let mut len_buf = [0u8; 4];
    io.read_exact(&mut len_buf).await?;
    let len = u32::from_be_bytes(len_buf) as usize;
    if len > limit {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "message too large",
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
    async fn join_decision_codec_roundtrip() {
        let mut codec = JoinDecisionCodec;
        let mut buf = Cursor::new(Vec::new());
        let proto = JOIN_DECISION_PROTOCOL.to_string();

        let decision = spaceroom::JoinDecision {
            decision_id: "dec-1".into(),
            space_id: Some(spaceroom::SpaceId {
                value: "space-123".into(),
            }),
            subject_peer_id: Some(spaceroom::PeerId {
                value: "peer-abc".into(),
            }),
            decision: spaceroom::JoinDecisionType::JoinApproved as i32,
            reason: "ok".into(),
            capability: None,
            created_at: None,
        };

        codec
            .write_request(&proto, &mut buf, decision.clone())
            .await
            .expect("write");
        buf.set_position(0);
        let decoded = codec
            .read_request(&proto, &mut buf)
            .await
            .expect("read back join decision");
        assert_eq!(decoded.decision_id, "dec-1");

        let mut buf2 = Cursor::new(Vec::new());
        codec
            .write_response(&proto, &mut buf2, JoinDecisionAck {})
            .await
            .expect("write ack");
        buf2.set_position(0);
        let _ = codec
            .read_response(&proto, &mut buf2)
            .await
            .expect("read ack");
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

    #[tokio::test]
    async fn reject_join_sets_rejection() {
        let req = sample_request();
        let peer = PeerId::random();
        let decision = crate::join::RejectAll.decide(&req, &peer).await;
        assert_eq!(
            decision.decision,
            spaceroom::JoinDecisionType::JoinRejected as i32
        );
        assert_eq!(decision.space_id.unwrap().value, "space-123");
        assert_eq!(decision.subject_peer_id.unwrap().value, "peer-abc");
        assert_eq!(decision.reason, "issuer not configured");
    }
}
