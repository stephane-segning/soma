use async_trait::async_trait;
use libp2p::{Multiaddr, PeerId, identity};
use soma_core::SomaResult;
use soma_proto_build::space;
use std::time::Duration;
use tokio::{sync::mpsc, task::JoinHandle};

/// Authorizes space-scoped reads (e.g., blob fetch) for remote peers.
#[async_trait]
pub trait SpaceAuthorizer: Send + Sync {
    async fn can_read_space(&self, peer: &PeerId, space_id: &str) -> bool;
}

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
        request: space::JoinRequest,
    },
    SendJoinDecision {
        target: PeerId,
        addrs: Vec<Multiaddr>,
        delivery_id: String,
        decision: space::JoinDecision,
    },
    /// Owner-side: send a signed issuer capability to `target` and wait
    /// for the delegate's ACK. The delivery_id is the daemon's
    /// per-issuance correlation id so the event handler can correlate
    /// the ack/failure with the in-flight transition.
    SendIssuerOffer {
        target: PeerId,
        addrs: Vec<Multiaddr>,
        delivery_id: String,
        space_id: String,
        capability: space::IssuerCapability,
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
        public_key: Option<identity::PublicKey>,
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
        decision: space::JoinDecision,
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
    /// Owner-side: the delegate ACK'd the offer over libp2p. Daemon
    /// transitions the bot's persistent status to `active`.
    IssuerOfferAckReceived {
        target: PeerId,
        delivery_id: String,
        space_id: String,
    },
    /// Owner-side: the libp2p send failed (timeout, no route to peer,
    /// codec error, etc). Daemon transitions the bot's persistent
    /// status to `failed`.
    IssuerOfferDeliveryFailed {
        target: PeerId,
        delivery_id: String,
        space_id: String,
        error: String,
    },
    /// Delegate-side: an issuer offer arrived for this peer. Logged for
    /// observability; the codec layer already auto-ACKs.
    IssuerOfferReceived {
        from: PeerId,
        space_id: String,
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
