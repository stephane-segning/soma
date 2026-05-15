mod llm;
mod routes;
mod state;

pub use routes::app;

/// Run the BFF service on the provided address with the given router.
pub async fn run(http_addr: std::net::SocketAddr, app: axum::Router) -> soma_core::SomaResult<()> {
    let listener = tokio::net::TcpListener::bind(http_addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
