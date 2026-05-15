use crate::protocol::MAX_JOIN_MESSAGE_BYTES;
use futures::prelude::*;
use prost::Message;
use std::io;

pub(super) async fn read_message<M, T>(io: &mut T) -> io::Result<M>
where
    M: Message + Default,
    T: AsyncRead + Unpin + Send,
{
    read_message_with_limit(io, MAX_JOIN_MESSAGE_BYTES).await
}

pub(super) async fn read_message_with_limit<M, T>(io: &mut T, limit: usize) -> io::Result<M>
where
    M: Message + Default,
    T: AsyncRead + Unpin + Send,
{
    let mut len_buf = [0u8; 4];
    io.read_exact(&mut len_buf).await?;
    let len = u32::from_be_bytes(len_buf) as usize;
    if len > limit {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "message too large",
        ));
    }

    let mut buf = vec![0u8; len];
    io.read_exact(&mut buf).await?;
    M::decode(buf.as_slice()).map_err(|err| io::Error::new(io::ErrorKind::InvalidData, err))
}

pub(super) async fn write_message<M, T>(io: &mut T, msg: M) -> io::Result<()>
where
    M: Message,
    T: AsyncWrite + Unpin + Send,
{
    let mut buf = Vec::new();
    msg.encode(&mut buf)
        .map_err(|err| io::Error::new(io::ErrorKind::InvalidData, err))?;
    let len = u32::try_from(buf.len()).map_err(|_| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            "join message exceeds u32 length",
        )
    })?;
    io.write_all(&len.to_be_bytes()).await?;
    io.write_all(&buf).await
}
