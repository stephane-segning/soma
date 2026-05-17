//! `somad relay` — libp2p Circuit Relay v2 service.
//!
//! Ported from the former `bins/relayd`. Shared logic lives in `crates/relay`.

use std::net::SocketAddr;
use std::path::PathBuf;

use clap::Subcommand;
use soma_core::http::{HttpServer, HttpService};
use soma_net::IdentityManager;
use tracing::info;

#[derive(Debug, clap::Args)]
pub struct Args {
    #[command(subcommand)]
    pub action: Option<Action>,

    /// HTTP address for /healthz and /metrics.
    #[arg(long, env = "HTTP_ADDR", default_value = "0.0.0.0:8081")]
    pub http_addr: SocketAddr,
}

#[derive(Debug, Subcommand)]
pub enum Action {
    /// Generate the relay identity (Ed25519 keypair) and exit.
    GenerateIdentity {
        /// Optional path override for the identity file.
        #[arg(long)]
        path: Option<PathBuf>,
    },
}

pub async fn run(args: Args) -> anyhow::Result<()> {
    let idm = IdentityManager::from_env();

    if let Some(Action::GenerateIdentity { path }) = args.action {
        let path = path.unwrap_or_else(|| idm.default_identity_path("relay"));
        let id = idm.generate(&path)?;
        info!(?path, peer_id = %id.peer_id(), "generated relay identity");
        return Ok(());
    }

    let metrics = soma_relay::RelayMetrics::new();

    let http_service = RelayHttpService {
        http_addr: args.http_addr,
        metrics: metrics.clone(),
    };

    let http = tokio::spawn(async move { HttpServer::new(http_service).run().await });
    let relay = tokio::spawn(async move { soma_relay::run(Default::default(), metrics).await });

    tokio::select! {
        res = http => res?.map_err(|e| anyhow::anyhow!(e))?,
        res = relay => res?.map_err(|e| anyhow::anyhow!(e))?,
        _ = tokio::signal::ctrl_c() => {
            info!("shutdown requested");
        }
    }

    Ok(())
}

#[derive(Clone)]
struct RelayHttpService {
    http_addr: SocketAddr,
    metrics: soma_relay::RelayMetrics,
}

impl HttpService for RelayHttpService {
    fn addr(&self) -> SocketAddr {
        self.http_addr
    }

    fn router(self) -> axum::Router {
        soma_relay::metrics_router(&self.metrics)
    }
}
