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

/// Replication metadata for one document, without its content.
///
/// `(updated_at_ms, origin_peer_id)` is the version. Compared
/// lexicographically it gives every peer the same winner for the same
/// pair of versions, which is the whole point — a bare timestamp ties on
/// same-millisecond writes and leaves the two sides permanently
/// disagreeing about who won.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DocumentDigest {
    pub document_id: String,
    pub updated_at_ms: i64,
    pub origin_peer_id: String,
    pub published: bool,
}

/// A document and the page row that makes it reachable.
///
/// The page travels with the document because they live in separate
/// tables and a document without its page is content the receiving UI
/// has no way to list. `title` empty means no page row was attached.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DocumentPayload {
    pub document_id: String,
    pub content_json: String,
    pub updated_at_ms: i64,
    pub origin_peer_id: String,
    pub published: bool,
    pub title: String,
    pub parent_page_ids: Vec<String>,
}

/// One side of a `/soma/doc-sync/1` exchange.
///
/// Exactly one of `have` / `want` is populated in practice: `have` is an
/// offer, `want` is a pull. See `codec::doc_sync` for why that split is
/// what makes the exchange terminate.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct DocumentSyncRequest {
    pub space_id: String,
    pub have: Vec<DocumentDigest>,
    pub want: Vec<String>,
    /// Payloads satisfying a `want` from the peer's previous response.
    pub documents: Vec<DocumentPayload>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct DocumentSyncResponse {
    pub authorized: bool,
    pub have: Vec<DocumentDigest>,
    pub documents: Vec<DocumentPayload>,
    /// Ids the responder wants back from the requester.
    pub want: Vec<String>,
}

/// Document replication policy, supplied by the daemon.
///
/// The peer crate owns no storage and no membership table, so every
/// decision that needs either — may this peer read this space, which
/// versions win, what should be written — lives behind this trait, the
/// same way blob reads go through `BlobProvider` and joins through
/// `JoinDecider`. The runtime only moves bytes.
#[async_trait]
pub trait DocumentSyncProvider: Send + Sync {
    /// Answer an inbound request. The implementation is responsible for
    /// authorizing `from` against `request.space_id` and must return
    /// `authorized: false` with everything else empty when it fails —
    /// a refusal that still listed documents would leak the roster of a
    /// space the caller cannot read.
    async fn handle_request(
        &self,
        from: &PeerId,
        request: DocumentSyncRequest,
    ) -> DocumentSyncResponse;

    /// Consume a response: apply any documents it carried, and decide
    /// whether to pull anything the peer advertised. Returning `Some`
    /// sends exactly one follow-up request; the follow-up carries only
    /// `want`, so it cannot provoke another round.
    async fn on_response(
        &self,
        from: &PeerId,
        space_id: &str,
        response: DocumentSyncResponse,
    ) -> Option<DocumentSyncRequest>;
}

/// Supplies and ingests space rosters for `/soma/roster/1`.
///
/// Split out from document sync because the two answer different
/// questions and fail differently: a roster row is a signed claim about
/// a third party that the receiver must verify against a pinned trust
/// anchor, while a document is content whose authority is already
/// settled by the time it is offered. Keeping them apart means the
/// verification rule lives in exactly one place.
#[async_trait]
pub trait RosterProvider: Send + Sync {
    /// Encoded `MembershipCapability` rows for `space_id`, or `None`
    /// if `from` may not read that space. `None` and an empty roster
    /// are different answers and must stay so — the first is a refusal.
    async fn roster_for(&self, from: &PeerId, space_id: &str) -> Option<Vec<Vec<u8>>>;

    /// Verify and persist rows learned from `from`, returning the
    /// peers newly learned about.
    ///
    /// The return value is what makes convergence prompt rather than
    /// eventual. Learning the roster is precisely what *enables*
    /// authorizing those peers, so a sync attempted before it would
    /// have been refused; reporting the new peers lets the daemon
    /// immediately retry with them instead of waiting for the next
    /// reconnect. Rows that fail verification are not reported.
    async fn ingest_roster(
        &self,
        from: &PeerId,
        space_id: &str,
        members: Vec<Vec<u8>>,
    ) -> Vec<PeerId>;
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
    /// Start (or continue) a document-sync exchange with `target`.
    ///
    /// Fire-and-forget like `AnnounceBlob`: the outcome arrives as a
    /// [`PeerEvent::DocumentsReplicated`] if anything was written, and
    /// a failure is simply a sync that did not happen — the next
    /// connection or local write retries it.
    SyncDocuments {
        target: PeerId,
        request: DocumentSyncRequest,
    },
    /// Ask `target` who else is in `space_id`.
    ///
    /// Fire-and-forget: a refusal or a failure simply means the roster
    /// is not learned this time, and the next connection retries.
    RequestRoster {
        target: PeerId,
        space_id: String,
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
    /// Verified roster rows were persisted, teaching us about peers we
    /// could not previously authorize. Carries only newly-learned
    /// peers — a roster that told us nothing new emits nothing.
    RosterLearned {
        space_id: String,
        peers: Vec<PeerId>,
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
