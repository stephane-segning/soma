use super::framing::{read_message, read_message_with_limit, write_message};
use crate::protocol::MAX_JOIN_DECISION_MESSAGE_BYTES;
use async_trait::async_trait;
use futures::prelude::*;
use libp2p::request_response as reqres;
use prost::Message;
use soma_proto_build::space;
use std::io;

#[derive(Clone, Default)]
pub(crate) struct JoinCodec;

#[derive(Clone, Default)]
pub(crate) struct JoinDecisionCodec;

#[derive(Clone, PartialEq, Message)]
pub(crate) struct JoinDecisionAck {}

#[async_trait]
impl reqres::Codec for JoinCodec {
    type Protocol = String;
    type Request = space::JoinRequest;
    type Response = space::JoinDecision;

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
    type Request = space::JoinDecision;
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
