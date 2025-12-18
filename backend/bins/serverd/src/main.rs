use std::net::SocketAddr;

use clap::{Parser, Subcommand};
use mimalloc::MiMalloc;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[derive(Debug, Parser)]
#[command(name = "soma-serverd", version)]
struct Args {
    #[command(subcommand)]
    cmd: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    Relay(RelayArgs),
    Rendezvous(RendezvousArgs),
    Bff(BffArgs),
}

#[derive(Debug, Parser)]
struct RelayArgs {
    #[arg(long, env = "SOMA_RELAY_HTTP_ADDR", default_value = "0.0.0.0:8081")]
    http_addr: SocketAddr,
}

#[derive(Debug, Parser)]
struct RendezvousArgs {
    #[arg(
        long,
        env = "SOMA_RENDEZVOUS_HTTP_ADDR",
        default_value = "0.0.0.0:8082"
    )]
    http_addr: SocketAddr,
}

#[derive(Debug, Parser)]
struct BffArgs {
    #[arg(long, env = "SOMA_BFF_HTTP_ADDR", default_value = "0.0.0.0:8083")]
    http_addr: SocketAddr,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    match Args::parse().cmd {
        Command::Relay(cfg) => {
            let http = tokio::spawn(async move {
                let listener = tokio::net::TcpListener::bind(cfg.http_addr).await?;
                let router = soma_metrics::router("relay");
                axum::serve(listener, router).await?;
                Ok::<(), Box<dyn std::error::Error + Send + Sync>>(())
            });

            let relay = tokio::spawn(async move { soma_relay::run().await });

            tokio::select! {
                res = http => res??,
                res = relay => res??,
                _ = tokio::signal::ctrl_c() => {
                    tracing::info!("shutdown requested");
                }
            }
        }
        Command::Rendezvous(cfg) => {
            let http = tokio::spawn(async move {
                let listener = tokio::net::TcpListener::bind(cfg.http_addr).await?;
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
        }
        Command::Bff(cfg) => {
            let app = soma_bff::app().nest_service("/metrics", soma_metrics::router("bff"));
            soma_bff::run(cfg.http_addr, app).await
        }
    }
}
