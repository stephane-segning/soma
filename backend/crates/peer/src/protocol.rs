use crate::codec::{BlobCodec, IssuerOfferCodec, JoinCodec, JoinDecisionCodec};
use libp2p::request_response as reqres;
use std::time::Duration;

pub(crate) const JOIN_PROTOCOL: &str = "/soma/join/1";
pub(crate) const JOIN_DECISION_PROTOCOL: &str = "/soma/join-decision/1";
pub(crate) const ISSUER_OFFER_PROTOCOL: &str = "/soma/issuer-offer/1";
pub(crate) const MAX_JOIN_MESSAGE_BYTES: usize = 16 * 1024;
pub(crate) const MAX_JOIN_DECISION_MESSAGE_BYTES: usize = 64 * 1024;
pub(crate) const MAX_ISSUER_OFFER_MESSAGE_BYTES: usize = 32 * 1024;
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
