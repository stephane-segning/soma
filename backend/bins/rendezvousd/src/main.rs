use std::net::SocketAddr;

use clap::Parser;
use mimalloc::MiMalloc;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[derive(Debug, Parser)]
#[command(name = "soma-rendezvousd", version)]
struct Args {
    #[arg(long, env = "SOMA_RENDEZVOUS_HTTP_ADDR", default_value = "0.0.0.0:8082")]
    http_addr: SocketAddr,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let Args { http_addr } = Args::parse();

    let http = tokio::spawn(async move {
        let listener = tokio::net::TcpListener::bind(http_addr).await?;
        let router = soma_metrics::router("rendezvous");
        axum::serve(listener, router).await?;
        Ok::<(), Box<dyn std::error::Error + Send + Sync>>(())
    });

    let rendezvous = tokio::spawn(async move { soma_rendezvous::run().await });

    tokio::select! {
        res = http => res??,
        res = rendezvous => res??,
        _ = tokio::signal::ctrl_c() => {
            tracing::info!("shutdown requested");
        }
    }

    Ok(())
}
