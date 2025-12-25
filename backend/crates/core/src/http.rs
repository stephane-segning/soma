use std::net::SocketAddr;

use axum::Router;

use crate::SomaResult;

/// Minimal trait for Axum-based services.
pub trait HttpService {
    fn addr(&self) -> SocketAddr;
    fn router(self) -> Router;
}

/// Bind and serve an [`HttpService`] with a Ctrl+C shutdown.
pub async fn run_http<S>(svc: S) -> SomaResult<()>
where
    S: HttpService + Send + 'static,
{
    let addr = svc.addr();
    let router = svc.router();
    let listener = tokio::net::TcpListener::bind(addr).await?;

    axum::serve(listener, router)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;

    Ok(())
}

