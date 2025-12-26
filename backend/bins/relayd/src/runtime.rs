use clap::Parser;
use soma_core::http::{HttpServer, HttpService};
use soma_net::IdentityManager;
use tracing::info;

use crate::config::{Args, Command};

pub async fn run_from_cli() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let Args { cmd, http_addr } = Args::parse();

    let idm = IdentityManager::from_env();

    if let Some(Command::GenerateIdentity { path }) = cmd {
        let path = path.unwrap_or_else(|| idm.default_identity_path("relay"));
        let id = idm.generate(&path)?;
        info!(
            "generated relay identity at {:?}, peer_id={}",
            path,
            id.peer_id()
        );
        return Ok(());
    }

    let metrics = soma_relay::RelayMetrics::new();

    let http_service = RelayHttpService {
        http_addr,
        metrics: metrics.clone(),
    };

    let http = tokio::spawn(async move {
        HttpServer::new(http_service)
            .run()
            .await
            .map_err(|e| Box::<dyn std::error::Error + Send + Sync>::from(e))
    });
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

#[derive(Clone)]
struct RelayHttpService {
    http_addr: std::net::SocketAddr,
    metrics: soma_relay::RelayMetrics,
}

impl HttpService for RelayHttpService {
    fn addr(&self) -> std::net::SocketAddr {
        self.http_addr
    }

    fn router(self) -> axum::Router {
        soma_relay::metrics_router(&self.metrics)
    }
}
