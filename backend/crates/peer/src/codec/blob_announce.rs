//! Wire codec for the `/soma/blob-announce/1` request_response protocol.
//!
//! A peer that just stored a blob tied to document content broadcasts a
//! lightweight availability hint to its connected peers; the payload is
//! exactly AGENTS.md's "Blobs" section: `space_id + cid + mime + size`. The
//! recipient replies with an empty [`BlobAnnounceAck`] — mirrors the
//! `IssuerOfferCodec` / `JoinDecisionCodec` pattern, where `Message::Response`
//! arrival is itself the confirmation and the ack payload carries no data.
//!
//! This is deliberately a point-to-point fan-out (broadcast to currently
//! connected peers), not gossipsub. See `soma_peer::blob` module docs for
//! why: it reuses this exact, already-proven codec/behaviour shape instead
//! of introducing a new pubsub concept (topics, message signing, mesh
//! tuning) for one lightweight hint message.

use super::framing::{read_message_with_limit, write_message};
use crate::protocol::MAX_BLOB_ANNOUNCE_MESSAGE_BYTES;
use async_trait::async_trait;
use futures::prelude::*;
use libp2p::request_response as reqres;
use prost::Message;
use std::io;

/// The announce payload itself. Kept peer-local (not in `soma_vdfs`)
/// because, unlike `BlobRequest`/`BlobResponse`, nothing outside the wire
/// protocol needs this shape — callers construct
/// [`crate::PeerCommand::AnnounceBlob`] from plain fields instead.
#[derive(Clone, PartialEq, Message)]
pub(crate) struct BlobAnnounce {
    #[prost(string, tag = "1")]
    pub space_id: String,
    #[prost(string, tag = "2")]
    pub cid: String,
    #[prost(string, tag = "3")]
    pub mime: String,
    #[prost(uint64, tag = "4")]
    pub size: u64,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct BlobAnnounceAck {}

#[derive(Clone, Default)]
pub(crate) struct BlobAnnounceCodec;

#[async_trait]
impl reqres::Codec for BlobAnnounceCodec {
    type Protocol = String;
    type Request = BlobAnnounce;
    type Response = BlobAnnounceAck;

    async fn read_request<T>(
        &mut self,
        _protocol: &Self::Protocol,
        io: &mut T,
    ) -> io::Result<Self::Request>
    where
        T: AsyncRead + Unpin + Send,
    {
        read_message_with_limit(io, MAX_BLOB_ANNOUNCE_MESSAGE_BYTES).await
    }

    async fn read_response<T>(
        &mut self,
        _protocol: &Self::Protocol,
        io: &mut T,
    ) -> io::Result<Self::Response>
    where
        T: AsyncRead + Unpin + Send,
    {
        read_message_with_limit(io, MAX_BLOB_ANNOUNCE_MESSAGE_BYTES).await
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
