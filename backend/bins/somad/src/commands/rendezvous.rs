//! `somad rendezvous` — libp2p rendezvous discovery service.
//!
//! Ported from the former `bins/rendezvousd`. Shared logic lives in `crates/rendezvous`.

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
    #[arg(long, env = "HTTP_ADDR", default_value = "0.0.0.0:8082")]
    pub http_addr: SocketAddr,
}

#[derive(Debug, Subcommand)]
pub enum Action {
    /// Generate the rendezvous identity (Ed25519 keypair) and exit.
    GenerateIdentity {
        /// Optional path override for the identity file.
        #[arg(long)]
        path: Option<PathBuf>,
    },
}

pub async fn run(args: Args) -> anyhow::Result<()> {
    let idm = IdentityManager::from_env();

    if let Some(Action::GenerateIdentity { path }) = args.action {
        let path = path.unwrap_or_else(|| idm.default_identity_path("rendezvous"));
        let id = idm.generate(&path)?;
        info!(?path, peer_id = %id.peer_id(), "generated rendezvous identity");
        return Ok(());
    }

    let metrics = soma_rendezvous::RendezvousMetrics::new();

    let http_service = RendezvousHttpService {
        http_addr: args.http_addr,
        metrics: metrics.clone(),
    };

    let http = tokio::spawn(async move { HttpServer::new(http_service).run().await });
    let rendezvous =
        tokio::spawn(async move { soma_rendezvous::run(Default::default(), metrics).await });

    tokio::select! {
        res = http => res?.map_err(|e| anyhow::anyhow!(e))?,
        res = rendezvous => res?.map_err(|e| anyhow::anyhow!(e))?,
        _ = tokio::signal::ctrl_c() => {
            info!("shutdown requested");
        }
    }

    Ok(())
}

#[derive(Clone)]
struct RendezvousHttpService {
    http_addr: SocketAddr,
    metrics: soma_rendezvous::RendezvousMetrics,
}

impl HttpService for RendezvousHttpService {
    fn addr(&self) -> SocketAddr {
        self.http_addr
    }

    fn router(self) -> axum::Router {
        soma_rendezvous::metrics_router(&self.metrics)
    }
}
