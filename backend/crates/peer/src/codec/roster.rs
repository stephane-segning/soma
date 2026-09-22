//! `/soma/roster/1` — learning who else is in a space.
//!
//! A peer that joined by invite records exactly one membership row: its
//! own. It therefore cannot authorize any other member, and everything
//! has to flow through the owner. This protocol is how a member learns
//! the rest of the roster.
//!
//! The entries are raw `MembershipCapability` protobufs — the same
//! owner-signed artifact the joiner received for itself. That is the
//! whole reason this can be answered by a *non-owner*: the receiver
//! verifies each row against the owner key it already pinned, so a
//! relayed row is exactly as trustworthy as a first-hand one and a
//! forged one fails the signature check regardless of who carried it.
//! `soma_membership::verify_third_party_membership` does that check.
//!
//! Deliberately a request/response with no digests or deltas. A roster
//! is small, changes rarely, and correctness here matters far more than
//! saving a few hundred bytes — sending the whole thing means there is
//! no incremental-state machinery to get subtly wrong.

use super::framing::{read_message_with_limit, write_message};
use crate::protocol::MAX_ROSTER_MESSAGE_BYTES;
use futures::prelude::*;
use libp2p::request_response as reqres;
use prost::Message;
use std::io;

#[derive(Clone, PartialEq, Message)]
pub(crate) struct RosterRequest {
    #[prost(string, tag = "1")]
    pub space_id: String,
}

#[derive(Clone, PartialEq, Message)]
pub(crate) struct RosterResponse {
    /// False when the requester is not a member. Everything else is
    /// then empty: a refusal must not reveal who is in a space the
    /// caller cannot read.
    #[prost(bool, tag = "1")]
    pub authorized: bool,
    /// Encoded `space::MembershipCapability`, one per member.
    ///
    /// Carried as opaque bytes rather than a typed nested message so
    /// this crate does not have to depend on the membership schema to
    /// move them — and so a row it cannot parse is the *receiver's*
    /// problem to reject, not something the transport silently drops.
    #[prost(bytes = "vec", repeated, tag = "2")]
    pub members: Vec<Vec<u8>>,
}

#[derive(Clone, Default)]
pub(crate) struct RosterCodec;

impl reqres::Codec for RosterCodec {
    type Protocol = String;
    type Request = RosterRequest;
    type Response = RosterResponse;

    async fn read_request<T>(
        &mut self,
        _protocol: &Self::Protocol,
        io: &mut T,
    ) -> io::Result<Self::Request>
    where
        T: AsyncRead + Unpin + Send,
    {
        read_message_with_limit(io, MAX_ROSTER_MESSAGE_BYTES).await
    }

    async fn read_response<T>(
        &mut self,
        _protocol: &Self::Protocol,
        io: &mut T,
    ) -> io::Result<Self::Response>
    where
        T: AsyncRead + Unpin + Send,
    {
        read_message_with_limit(io, MAX_ROSTER_MESSAGE_BYTES).await
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
