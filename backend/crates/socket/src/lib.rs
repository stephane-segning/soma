use std::{future::Future, path::Path};

use soma_core::SomaResult;
use tokio::net::{UnixListener, UnixStream};
use tracing::{info, warn};
use tonic::transport::server::Router as TonicRouter;

/// Run a Unix socket server with a custom connection handler and shutdown future.
pub async fn serve_unix_with_shutdown<F, Fut, S>(
    socket_path: S,
    handler: F,
    shutdown: impl Future<Output = ()> + Send,
) -> SomaResult<()>
where
    F: Fn(UnixStream) -> Fut + Send + Sync + Clone + 'static,
    Fut: Future<Output = ()> + Send + 'static,
    S: AsRef<Path>,
{
    let socket_path = socket_path.as_ref();
    if let Some(parent) = socket_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if socket_path.exists() {
        std::fs::remove_file(socket_path)?;
    }

    let listener = UnixListener::bind(socket_path)?;
    info!(path=?socket_path, "listening on unix socket");

    tokio::pin!(shutdown);
    loop {
        tokio::select! {
            _ = &mut shutdown => {
                info!("unix socket shutdown requested");
                break;
            }
            accept_res = listener.accept() => {
                match accept_res {
                    Ok((stream, _addr)) => {
                        let handler = handler.clone();
                        tokio::spawn(async move { handler(stream).await });
                    }
                    Err(err) => {
                        warn!(?err, "failed to accept unix socket connection");
                    }
                }
            }
        }
    }

    if socket_path.exists() {
        let _ = std::fs::remove_file(socket_path);
    }

    Ok(())
}

/// Serve a tonic gRPC router over a Unix Domain Socket, respecting a shutdown signal.
pub async fn serve_grpc_unix(
    socket_path: impl AsRef<Path>,
    router: TonicRouter,
    shutdown: impl Future<Output = ()> + Send,
) -> SomaResult<()> {
    let socket_path = socket_path.as_ref();
    if let Some(parent) = socket_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if socket_path.exists() {
        std::fs::remove_file(socket_path)?;
    }

    let listener = UnixListener::bind(socket_path)?;
    let incoming = tokio_stream::wrappers::UnixListenerStream::new(listener);
    info!(path=?socket_path, "serving gRPC over unix socket");

    router
        .serve_with_incoming_shutdown(incoming, shutdown)
        .await
        .map_err(soma_core::Error::service)?;

    if socket_path.exists() {
        let _ = std::fs::remove_file(socket_path);
    }

    Ok(())
}
