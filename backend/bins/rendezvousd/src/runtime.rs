use clap::Parser;

use soma_core::http::{HttpService, run_http};
use soma_net::{default_identity_path, generate_identity};

use crate::config::{Args, Command};

pub async fn run_from_cli() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let Args { cmd, http_addr } = Args::parse();

    if let Some(Command::GenerateIdentity { path }) = cmd {
        let path = path.unwrap_or_else(|| default_identity_path("rendezvous"));
        let id = generate_identity(&path)?;
        println!(
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
        run_http(http_service)
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
