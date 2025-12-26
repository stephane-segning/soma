use clap::Parser;
use soma_core::http::{HttpServer, HttpService};
use soma_net::IdentityManager;
use tracing::info;

use crate::config::{Args, Command};

pub async fn run_from_cli() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let Args { cmd, http_addr } = Args::parse();

    let idm = IdentityManager::from_env();

    if let Some(Command::GenerateIdentity { path }) = cmd {
        let path = path.unwrap_or_else(|| idm.default_identity_path("rendezvous"));
        let id = idm.generate(&path)?;
        info!(
            "generated rendezvous identity at {:?}, peer_id={}",
            path,
            id.peer_id()
        );
        return Ok(());
    }

    let metrics = soma_rendezvous::RendezvousMetrics::new();

    let http_service = RendezvousHttpService {
        http_addr,
        metrics: metrics.clone(),
    };

    let http = tokio::spawn(async move {
        HttpServer::new(http_service)
            .run()
            .await
            .map_err(|e| Box::<dyn std::error::Error + Send + Sync>::from(e))
    });

    let rendezvous =
        tokio::spawn(async move { soma_rendezvous::run(Default::default(), metrics).await });

    tokio::select! {
        res = http => res??,
        res = rendezvous => res??,
        _ = tokio::signal::ctrl_c() => {
            tracing::info!("shutdown requested");
        }
    }

    Ok(())
}

#[derive(Clone)]
struct RendezvousHttpService {
    http_addr: std::net::SocketAddr,
    metrics: soma_rendezvous::RendezvousMetrics,
}

impl HttpService for RendezvousHttpService {
    fn addr(&self) -> std::net::SocketAddr {
        self.http_addr
    }

    fn router(self) -> axum::Router {
        soma_rendezvous::metrics_router(&self.metrics)
    }
}
