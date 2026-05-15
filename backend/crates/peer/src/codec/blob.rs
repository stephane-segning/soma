use super::framing::{read_message_with_limit, write_message};
use async_trait::async_trait;
use futures::prelude::*;
use libp2p::request_response as reqres;
use soma_vdfs::{BlobRequest, BlobResponse, MAX_BLOB_MESSAGE_BYTES};
use std::io;

#[derive(Clone, Default)]
pub(crate) struct BlobCodec;

#[async_trait]
impl reqres::Codec for BlobCodec {
    type Protocol = String;
    type Request = BlobRequest;
    type Response = BlobResponse;

    async fn read_request<T>(
        &mut self,
        _protocol: &Self::Protocol,
        io: &mut T,
    ) -> io::Result<Self::Request>
    where
        T: AsyncRead + Unpin + Send,
    {
        read_message_with_limit(io, MAX_BLOB_MESSAGE_BYTES).await
    }

    async fn read_response<T>(
        &mut self,
        _protocol: &Self::Protocol,
        io: &mut T,
    ) -> io::Result<Self::Response>
    where
        T: AsyncRead + Unpin + Send,
    {
        read_message_with_limit(io, MAX_BLOB_MESSAGE_BYTES).await
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
