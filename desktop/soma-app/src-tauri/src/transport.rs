use std::{
    pin::Pin,
    task::{Context, Poll},
};

use hyper::rt::{Read, ReadBufCursor, Write};
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};
use tokio::net::UnixStream;
use tonic::transport::Uri;
use tower::service_fn;

/// Minimal compatibility wrapper to satisfy `hyper::rt` traits for tokio types without pulling hyper-util.
pub struct TokioIoCompat<T>(pub T);

impl<T: AsyncRead + Unpin> Read for TokioIoCompat<T> {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        mut buf: ReadBufCursor<'_>,
    ) -> Poll<std::io::Result<()>> {
        let maybe_uninit = unsafe { buf.as_mut() };
        let mut read_buf = ReadBuf::uninit(maybe_uninit);
        let poll = Pin::new(&mut self.get_mut().0).poll_read(cx, &mut read_buf);
        if let Poll::Ready(Ok(())) = &poll {
            let filled = read_buf.filled().len();
            unsafe { buf.advance(filled) };
        }
        poll
    }
}

impl<T: AsyncWrite + Unpin> Write for TokioIoCompat<T> {
    fn poll_write(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        Pin::new(&mut self.get_mut().0).poll_write(cx, buf)
    }

    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.get_mut().0).poll_flush(cx)
    }

    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.get_mut().0).poll_shutdown(cx)
    }
}

pub fn unix_connector(
    path: std::path::PathBuf,
) -> impl tower::Service<
    Uri,
    Response = TokioIoCompat<UnixStream>,
    Error = std::io::Error,
    Future = impl std::future::Future<Output = Result<TokioIoCompat<UnixStream>, std::io::Error>> + Send,
> + Clone
+ Send
+ 'static {
    service_fn(move |_: Uri| {
        let path = path.clone();
        async move { UnixStream::connect(path).await.map(TokioIoCompat) }
    })
}
