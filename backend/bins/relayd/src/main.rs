use std::net::SocketAddr;

use clap::Parser;
use mimalloc::MiMalloc;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[derive(Debug, Parser)]
#[command(name = "soma-relayd", version)]
struct Args {
    #[arg(long, env = "HTTP_ADDR", default_value = "0.0.0.0:8081")]
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

    // Start metrics/health server.
    let metrics = soma_relay::RelayMetrics::new();

    let http = {
        let metrics = metrics.clone();
        tokio::spawn(async move {
            let listener = tokio::net::TcpListener::bind(http_addr).await?;
            let router = soma_relay::metrics_router(&metrics);
            axum::serve(listener, router).await?;
            Ok::<(), Box<dyn std::error::Error + Send + Sync>>(())
        })
    };

    let relay = tokio::spawn(async move { soma_relay::run(Default::default(), metrics).await });

    tokio::select! {
        res = http => res??,
        res = relay => res??,
        _ = tokio::signal::ctrl_c() => {
            tracing::info!("shutdown requested");
        }
    }

    Ok(())
}
