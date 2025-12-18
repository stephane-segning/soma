use std::net::SocketAddr;

use clap::Parser;
use mimalloc::MiMalloc;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[derive(Debug, Parser)]
#[command(name = "soma-bffd", version)]
struct Args {
    #[arg(long, env = "HTTP_ADDR", default_value = "0.0.0.0:8083")]
    http_addr: SocketAddr,
}

#[tokio::main]
async fn main() -> soma_core::SomaResult<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let Args { http_addr } = Args::parse();

    // Build business API (Axum lives in crate for BFF).
    let app = soma_bff::app()
        .nest_service("/metrics", soma_metrics::router("bff"));

    soma_bff::run(http_addr, app).await
}
