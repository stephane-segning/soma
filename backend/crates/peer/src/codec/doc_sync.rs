//! `/soma/doc-sync/1` — document replication between space members.
//!
//! Shaped like the blob path AGENTS.md describes ("availability hint" +
//! pull), not a push: a peer advertises *digests* of what it holds and
//! the other side asks for whatever it is missing. Nothing is ever
//! pushed unasked, so a peer cannot be made to store content it did not
//! request, and an advertisement costs a few dozen bytes per document
//! rather than the document itself.
//!
//! One exchange syncs both directions in two round trips:
//!
//! ```text
//! A -> B  have: A's digests                     (the offer)
//! B -> A  have: B's digests, want: what B lacks
//! A -> B  want: what A lacks, documents: what B asked for
//! B -> A  documents: what A asked for
//! ```
//!
//! `documents` on a *request* only ever satisfies a `want` the peer
//! expressed in its own previous response, so nothing is sent unasked
//! and the receiver drops anything it did not ask for. The last message
//! carries neither `have` nor `want`, which is what makes the exchange
//! terminate rather than ping-pong. See `runtime::doc_sync`.

use super::framing::{read_message_with_limit, write_message};
use crate::protocol::MAX_DOC_SYNC_MESSAGE_BYTES;
use async_trait::async_trait;
use futures::prelude::*;
use libp2p::request_response as reqres;
use prost::Message;
use std::io;

/// What one peer holds for a single document, without the content.
///
/// `(updated_at_ms, origin_peer_id)` is the version: the pair is
/// compared lexicographically so two peers independently reach the same
/// winner without coordinating. `origin_peer_id` is not decoration — it
/// is what makes a same-millisecond tie resolve identically on both
/// sides instead of each keeping its own copy forever.
#[derive(Clone, PartialEq, Message)]
pub(crate) struct DocDigest {
    #[prost(string, tag = "1")]
    pub document_id: String,
    #[prost(int64, tag = "2")]
    pub updated_at_ms: i64,
    #[prost(string, tag = "3")]
    pub origin_peer_id: String,
    #[prost(bool, tag = "4")]
    pub published: bool,
}

/// A document plus the page row that makes it reachable in the UI.
///
/// Pages are a separate table keyed `(space_id, page_id)`, and a
/// document with no page is invisible — it exists in storage but no
/// navigation surface lists it. Replicating the two together is what
/// stops a peer from receiving content it cannot open.
#[derive(Clone, PartialEq, Message)]
pub(crate) struct DocPayload {
    #[prost(string, tag = "1")]
    pub document_id: String,
    #[prost(string, tag = "2")]
    pub content_json: String,
    #[prost(int64, tag = "3")]
    pub updated_at_ms: i64,
    #[prost(string, tag = "4")]
    pub origin_peer_id: String,
    #[prost(bool, tag = "5")]
    pub published: bool,
    /// Page title. Empty means "no page row travelled with this".
    #[prost(string, tag = "6")]
    pub title: String,
    #[prost(string, repeated, tag = "7")]
    pub parent_page_ids: Vec<String>,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct DocSyncRequest {
    #[prost(string, tag = "1")]
    pub space_id: String,
    /// Digests the sender holds. An offer.
    #[prost(message, repeated, tag = "2")]
    pub have: Vec<DocDigest>,
    /// Document ids the sender wants back. A pull.
    #[prost(string, repeated, tag = "3")]
    pub want: Vec<String>,
    /// Payloads satisfying a `want` the peer expressed in its previous
    /// response. Never unsolicited: a receiver drops any document it did
    /// not ask for, so this cannot be used to push content.
    #[prost(message, repeated, tag = "4")]
    pub documents: Vec<DocPayload>,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct DocSyncResponse {
    /// False when the requester is not a member of `space_id`. The
    /// remaining fields are then empty — a refusal must not leak which
    /// documents exist, or even whether the space does.
    #[prost(bool, tag = "1")]
    pub authorized: bool,
    /// Responder's digests, when answering an offer.
    #[prost(message, repeated, tag = "2")]
    pub have: Vec<DocDigest>,
    /// Payloads, when answering a pull.
    #[prost(message, repeated, tag = "3")]
    pub documents: Vec<DocPayload>,
    /// Ids the responder wants from the requester. Set only when
    /// answering an offer; this is what makes one exchange sync both
    /// directions instead of needing two.
    #[prost(string, repeated, tag = "4")]
    pub want: Vec<String>,
}

#[derive(Clone, Default)]
pub(crate) struct DocSyncCodec;

#[async_trait]
impl reqres::Codec for DocSyncCodec {
    type Protocol = String;
    type Request = DocSyncRequest;
    type Response = DocSyncResponse;

    async fn read_request<T>(
        &mut self,
        _protocol: &Self::Protocol,
        io: &mut T,
    ) -> io::Result<Self::Request>
    where
        T: AsyncRead + Unpin + Send,
    {
        read_message_with_limit(io, MAX_DOC_SYNC_MESSAGE_BYTES).await
    }

    async fn read_response<T>(
        &mut self,
        _protocol: &Self::Protocol,
        io: &mut T,
    ) -> io::Result<Self::Response>
    where
        T: AsyncRead + Unpin + Send,
    {
        read_message_with_limit(io, MAX_DOC_SYNC_MESSAGE_BYTES).await
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
