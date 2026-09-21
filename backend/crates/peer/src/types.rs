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
    /// Broadcast a lightweight "blob availability hint" to every currently
    /// connected peer. Fire-and-forget: the payload matches AGENTS.md's
    /// "Blobs" section exactly (`space_id + cid + mime + size`). Receivers
    /// emit [`PeerEvent::BlobAnnounceReceived`] and may enqueue a fetch
    /// (mirror bots do; see `somad bot`'s `BlobAnnounceFetchHandler`).
    AnnounceBlob {
        space_id: String,
        cid: String,
        mime: String,
        size: u64,
    },
    Shutdown,
}

/// Events emitted by the peer runtime for logging/metrics.
///
/// `large_enum_variant` is pre-existing here (not introduced by the blob
/// work): the size spread comes from proto-generated `space::JoinDecision`
/// / `space::IssuerCapability` payloads on the join/issuer variants, not
/// from anything blob-related. Boxing those fields is a real fix, but it
/// ripples through every join/issuer call site
/// (`runtime/join.rs`, `runtime/issuer.rs`, daemon's `join_events.rs` /
/// `issuer_events.rs` handlers, `somad bot`'s `join_decision_apply.rs`,
/// metrics) — out of scope for a blob-subsystem change, and that surface
/// is under active, unrelated development elsewhere right now. Silencing
/// with a comment rather than leaving `-D warnings` broken for reasons
/// this task didn't touch.
#[allow(clippy::large_enum_variant)]
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
    /// Delegate-side: an issuer offer arrived for this peer. The codec
    /// layer auto-ACKs; downstream handlers persist the signed
    /// capability so the bot can use it later (e.g. to auto-approve
    /// join requests via the membership crate's `load_issuer_capability`).
    IssuerOfferReceived {
        from: PeerId,
        space_id: String,
        capability: space::IssuerCapability,
    },
    /// Emitted when a "blob availability hint" (see [`PeerCommand::AnnounceBlob`])
    /// arrives from another peer. `from` is the announcing peer, so a
    /// reaction (e.g. a mirror bot enqueueing a fetch) can target it
    /// directly without any separate candidate-peer lookup. Was named
    /// `YooptaBlobAdded` historically; the editor is Tiptap now, and the
    /// old name also implied "stored locally" when this variant is only
    /// ever constructed for an *inbound* network announce.
    BlobAnnounceReceived {
        from: PeerId,
        space_id: String,
        cid: String,
        mime: String,
        size: u64,
    },
    /// Emitted when we receive a blob fetch response over the network,
    /// whether or not it was ultimately persisted.
    BlobResponseReceived {
        space_id: String,
        cid: String,
        mime: String,
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
