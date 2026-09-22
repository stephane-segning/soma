//! Wire codec for the `/soma/issuer-offer/1` request_response protocol.
//!
//! The owner sends a signed `space::IssuerCapability` to the delegate
//! peer; the delegate replies with an empty `IssuerCapabilityAck`. The
//! libp2p source-peer identity authenticates the ACK — no separate
//! delegate signature is required at v0. The ACK itself is unconditional
//! and happens synchronously here, before any verification: this codec
//! never inspects `signed`, so it does not and cannot gate the ACK on
//! provenance. Verification of the capability's signature — and of
//! whether its claimed owner is actually this space's trusted owner —
//! happens asynchronously afterwards, in the delegate's
//! `IssuerOfferReceived` handler (`soma_membership::verify_inbound_issuer_capability`,
//! called from `daemon::handlers::issuer_events` / `somad`'s
//! `issuer_inbound` handler), which decides whether to persist the
//! capability, not whether to ACK.

use super::framing::{read_message_with_limit, write_message};
use crate::protocol::MAX_ISSUER_OFFER_MESSAGE_BYTES;
use futures::prelude::*;
use libp2p::request_response as reqres;
use prost::Message;
use soma_proto_build::space;
use std::io;

/// Empty ACK. Mirrors the `JoinDecisionAck` pattern — the request side
/// (libp2p reqres) treats `Message::Response` arrival as the
/// confirmation, so the payload itself need not carry data.
#[derive(Clone, PartialEq, Message)]
pub(crate) struct IssuerCapabilityAck {}

#[derive(Clone, Default)]
pub(crate) struct IssuerOfferCodec;

impl reqres::Codec for IssuerOfferCodec {
    type Protocol = String;
    type Request = space::IssuerCapability;
    type Response = IssuerCapabilityAck;

    async fn read_request<T>(
        &mut self,
        _protocol: &Self::Protocol,
        io: &mut T,
    ) -> io::Result<Self::Request>
    where
        T: AsyncRead + Unpin + Send,
    {
        read_message_with_limit(io, MAX_ISSUER_OFFER_MESSAGE_BYTES).await
    }

    async fn read_response<T>(
        &mut self,
        _protocol: &Self::Protocol,
        io: &mut T,
    ) -> io::Result<Self::Response>
    where
        T: AsyncRead + Unpin + Send,
    {
        read_message_with_limit(io, MAX_ISSUER_OFFER_MESSAGE_BYTES).await
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
