use std::{net::SocketAddr, path::PathBuf};

use axum::{routing::get, Router};
use clap::{Parser, Subcommand};
use mimalloc::MiMalloc;
use soma_net::{default_identity_path, generate_identity};

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[derive(Debug, Parser)]
#[command(name = "soma-botd", version)]
struct Args {
    #[command(subcommand)]
    cmd: Option<Command>,

    #[arg(long, env = "HTTP_ADDR", default_value = "0.0.0.0:8080")]
    http_addr: SocketAddr,

    #[arg(long, env = "SOMA_BLOB_DIR", default_value = "./blobs")]
    blob_dir: PathBuf,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Generate the botd identity and exit.
    GenerateIdentity {
        /// Optional path override for the identity file.
        #[arg(long)]
        path: Option<std::path::PathBuf>,
    },
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    let args = Args::parse();

    if let Some(Command::GenerateIdentity { path }) = args.cmd {
        let path = path.unwrap_or_else(|| default_identity_path("bot"));
        let id = generate_identity(&path)?;
        println!("generated bot identity at {:?}, peer_id={}", path, id.peer_id());
        return Ok(());
    }
    tracing::info!(?args.http_addr, ?args.blob_dir, "starting soma-botd");

    let app = Router::new().route("/healthz", get(|| async { "ok" }));
    let metrics = soma_metrics::router("bot");

    let listener = tokio::net::TcpListener::bind(args.http_addr).await?;
    axum::serve(listener, app.merge(metrics)).await?;

    Ok(())
}
