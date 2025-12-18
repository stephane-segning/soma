use std::{future::Future, net::SocketAddr};

use clap::{Parser, Subcommand};
use mimalloc::MiMalloc;
use soma_core::{Error, SomaResult};

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
    #[arg(long, env = "HTTP_ADDR", default_value = "0.0.0.0:8081")]
    http_addr: SocketAddr,
}

#[derive(Debug, Parser)]
struct RendezvousArgs {
    #[arg(
        long,
        env = "HTTP_ADDR",
        default_value = "0.0.0.0:8082"
    )]
    http_addr: SocketAddr,
}

#[derive(Debug, Parser)]
struct BffArgs {
    #[arg(long, env = "HTTP_ADDR", default_value = "0.0.0.0:8083")]
    http_addr: SocketAddr,
}

#[tokio::main]
async fn main() -> SomaResult<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    match Args::parse().cmd {
        Command::Relay(cfg) => {
            run_with_metrics("relay", cfg.http_addr, || async {
                soma_relay::run(Default::default()).await
            })
            .await?;
        }
        Command::Rendezvous(cfg) => {
            run_with_metrics("rendezvous", cfg.http_addr, || async {
                soma_rendezvous::run(Default::default()).await
            })
            .await?;
        }
        Command::Bff(cfg) => {
            let app = soma_bff::app().merge(soma_metrics::router("bff"));
            soma_bff::run(cfg.http_addr, app).await?;
        }
    }
    Ok(())
}

async fn run_with_metrics<F, Fut>(
    service: &'static str,
    http_addr: SocketAddr,
    service_fn: F,
) -> SomaResult<()>
where
    F: FnOnce() -> Fut + Send + 'static,
    Fut: Future<Output = SomaResult<()>> + Send + 'static,
{
    let http = tokio::spawn(async move {
        let listener = tokio::net::TcpListener::bind(http_addr).await?;
        let router = soma_metrics::router(service);
        axum::serve(listener, router).await.map_err(Error::http)?;
        Ok::<(), Error>(())
    });

    let svc = tokio::spawn(async move { service_fn().await });

    tokio::select! {
        res = http => res??,
        res = svc => res??,
        _ = tokio::signal::ctrl_c() => {
            tracing::info!("shutdown requested");
        }
    }

    Ok(())
}
