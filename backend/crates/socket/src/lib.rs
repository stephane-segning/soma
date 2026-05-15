use std::path::Path;

use soma_core::SomaResult;
use tokio::net::UnixListener;
use tonic::transport::Server;
use tonic::transport::server::Router as TonicRouter;
use tracing::{info, warn};

/// Serve a tonic gRPC router over a Unix Domain Socket, respecting a shutdown signal.
#[inline]
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
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Err(error) =
            std::fs::set_permissions(socket_path, std::fs::Permissions::from_mode(0o666))
        {
            warn!(?error, path=?socket_path, "failed to set unix socket permissions");
        }
    }
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

/// Trait for gRPC services served over Unix sockets.
pub trait GrpcUnixService {
    fn socket_path(&self) -> &Path;
    fn configure(self, server: Server) -> TonicRouter;
}

/// Wrapper that owns a Unix gRPC service and runs it.
pub struct GrpcUnixServer<S: GrpcUnixService> {
    svc: S,
}

impl<S: GrpcUnixService> GrpcUnixServer<S> {
    pub fn new(svc: S) -> Self {
        Self { svc }
    }

    pub async fn run(self) -> SomaResult<()>
    where
        S: Send + 'static,
    {
        let socket = self.svc.socket_path().to_path_buf();
        let router = self.svc.configure(Server::builder());
        serve_grpc_unix(socket, router, async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
    }
}
