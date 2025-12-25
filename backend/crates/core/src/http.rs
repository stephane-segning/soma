use std::net::SocketAddr;

use axum::Router;

use crate::SomaResult;

/// Minimal trait for Axum-based services.
pub trait HttpService {
    fn addr(&self) -> SocketAddr;
    fn router(self) -> Router;
}

/// Thin wrapper that owns an [`HttpService`] and runs it.
pub struct HttpServer<S: HttpService> {
    svc: S,
}

impl<S: HttpService> HttpServer<S> {
    pub fn new(svc: S) -> Self {
        Self { svc }
    }

    pub async fn run(self) -> SomaResult<()>
    where
        S: Send + 'static,
    {
        let addr = self.svc.addr();
        let router = self.svc.router();
        let listener = tokio::net::TcpListener::bind(addr).await?;

        axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = tokio::signal::ctrl_c().await;
            })
            .await?;

        Ok(())
    }
}
