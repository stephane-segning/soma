use std::{future::Future, path::Path};

use soma_core::SomaResult;
use tokio::io::AsyncWriteExt;
use tokio::net::{UnixListener, UnixStream};
use tracing::{info, warn};

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

/// Convenience helper that writes a static message to each connection.
pub async fn serve_unix_message(
    socket_path: impl AsRef<Path>,
    message: String,
    shutdown: impl Future<Output = ()> + Send,
) -> SomaResult<()> {
    serve_unix_with_shutdown(
        socket_path,
        move |mut stream| {
            let message = message.clone();
            async move {
                if let Err(err) = stream.write_all(message.as_bytes()).await {
                    warn!(?err, "failed to write unix socket message");
                }
            }
        },
        shutdown,
    )
    .await
}
