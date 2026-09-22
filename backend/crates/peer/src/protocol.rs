use crate::codec::{
    BlobAnnounceCodec, BlobCodec, DocSyncCodec, IssuerOfferCodec, JoinCodec, JoinDecisionCodec,
    RosterCodec,
};
use libp2p::request_response as reqres;
use std::time::Duration;

pub(crate) const JOIN_PROTOCOL: &str = "/soma/join/1";
pub(crate) const JOIN_DECISION_PROTOCOL: &str = "/soma/join-decision/1";
pub(crate) const ISSUER_OFFER_PROTOCOL: &str = "/soma/issuer-offer/1";
pub(crate) const BLOB_ANNOUNCE_PROTOCOL: &str = "/soma/blob-announce/1";
pub(crate) const DOC_SYNC_PROTOCOL: &str = "/soma/doc-sync/1";
pub(crate) const ROSTER_PROTOCOL: &str = "/soma/roster/1";
pub(crate) const MAX_JOIN_MESSAGE_BYTES: usize = 16 * 1024;
pub(crate) const MAX_JOIN_DECISION_MESSAGE_BYTES: usize = 64 * 1024;
pub(crate) const MAX_ISSUER_OFFER_MESSAGE_BYTES: usize = 32 * 1024;
/// Announces carry only `space_id + cid + mime + size` (see AGENTS.md's
/// "Blobs" section) — small, fixed-shape, well under join-decision's cap.
pub(crate) const MAX_BLOB_ANNOUNCE_MESSAGE_BYTES: usize = 16 * 1024;
/// Generous next to the other caps because one response can carry
/// several whole documents. Still a hard ceiling: the framing layer
/// refuses anything larger before allocating, so a peer cannot make us
/// reserve memory by declaring a huge length. Batch sizes in
/// `runtime::doc_sync` are chosen to stay well inside this.
pub(crate) const MAX_DOC_SYNC_MESSAGE_BYTES: usize = 8 * 1024 * 1024;
/// A roster is a few hundred bytes per member, so 1 MiB is already
/// thousands of members. The cap exists so a peer cannot make us
/// allocate on its say-so, not to bound realistic rosters.
pub(crate) const MAX_ROSTER_MESSAGE_BYTES: usize = 1024 * 1024;
pub(crate) const AGENT_PROTOCOL: &str = "/soma/0.1.0";
pub(crate) const BLOB_CHUNK_BYTES: usize = soma_vdfs::DEFAULT_BLOB_CHUNK_BYTES;

pub(crate) fn build_join_behaviour() -> reqres::Behaviour<JoinCodec> {
    let protocols = std::iter::once((JOIN_PROTOCOL.to_string(), reqres::ProtocolSupport::Full));
    let cfg = reqres::Config::default().with_request_timeout(Duration::from_secs(10));
    reqres::Behaviour::new(protocols, cfg)
}

pub(crate) fn build_join_decision_behaviour() -> reqres::Behaviour<JoinDecisionCodec> {
    let protocols = std::iter::once((
        JOIN_DECISION_PROTOCOL.to_string(),
        reqres::ProtocolSupport::Full,
    ));
    let cfg = reqres::Config::default().with_request_timeout(Duration::from_secs(10));
    reqres::Behaviour::new(protocols, cfg)
}

pub(crate) fn build_issuer_offer_behaviour() -> reqres::Behaviour<IssuerOfferCodec> {
    let protocols = std::iter::once((
        ISSUER_OFFER_PROTOCOL.to_string(),
        reqres::ProtocolSupport::Full,
    ));
    let cfg = reqres::Config::default().with_request_timeout(Duration::from_secs(10));
    reqres::Behaviour::new(protocols, cfg)
}

pub(crate) fn build_blob_behaviour() -> reqres::Behaviour<BlobCodec> {
    let protocols = std::iter::once((
        soma_vdfs::BLOB_PROTOCOL.to_string(),
        reqres::ProtocolSupport::Full,
    ));
    // Blob transfers may take longer; allow a more generous timeout.
    let cfg = reqres::Config::default().with_request_timeout(Duration::from_secs(30));
    reqres::Behaviour::new(protocols, cfg)
}

pub(crate) fn build_blob_announce_behaviour() -> reqres::Behaviour<BlobAnnounceCodec> {
    let protocols = std::iter::once((
        BLOB_ANNOUNCE_PROTOCOL.to_string(),
        reqres::ProtocolSupport::Full,
    ));
    let cfg = reqres::Config::default().with_request_timeout(Duration::from_secs(10));
    reqres::Behaviour::new(protocols, cfg)
}

pub(crate) fn build_doc_sync_behaviour() -> reqres::Behaviour<DocSyncCodec> {
    let protocols = std::iter::once((
        DOC_SYNC_PROTOCOL.to_string(),
        reqres::ProtocolSupport::Full,
    ));
    // Longer than the control protocols: a pull response may carry several
    // documents and the responder reads them from disk first.
    let cfg = reqres::Config::default().with_request_timeout(Duration::from_secs(30));
    reqres::Behaviour::new(protocols, cfg)
}

pub(crate) fn build_roster_behaviour() -> reqres::Behaviour<RosterCodec> {
    let protocols = std::iter::once((ROSTER_PROTOCOL.to_string(), reqres::ProtocolSupport::Full));
    let cfg = reqres::Config::default().with_request_timeout(Duration::from_secs(10));
    reqres::Behaviour::new(protocols, cfg)
}
