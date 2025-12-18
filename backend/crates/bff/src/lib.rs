use std::error::Error;

use axum::{routing::get, Router};

/// Build the BFF application router (business APIs go here).
pub fn app() -> Router {
    Router::new().route("/healthz", get(|| async { "ok" }))
}

/// Run the BFF service on the provided address with the given router.
pub async fn run(http_addr: std::net::SocketAddr, app: Router) -> Result<(), Box<dyn Error + Send + Sync>> {
    let listener = tokio::net::TcpListener::bind(http_addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
