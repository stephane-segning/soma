use clap::Parser;

use soma_core::{Error, SomaResult};

use crate::config::{Args, Command};
use soma_core::http::{HttpService, HttpServer};

pub async fn run_from_cli() -> SomaResult<()> {
    match Args::parse().cmd {
        Command::Relay(cfg) => {
            let metrics = soma_relay::RelayMetrics::new();
            let http = tokio::spawn({
                let svc = RelayHttpService {
                    http_addr: cfg.http_addr,
                    metrics: metrics.clone(),
                };
                async move { HttpServer::new(svc).run().await.map_err(Error::http) }
            });

            let svc = tokio::spawn(async move { soma_relay::run(Default::default(), metrics).await });

            tokio::select! {
                res = http => res??,
                res = svc => res??,
                _ = tokio::signal::ctrl_c() => {
                    tracing::info!("shutdown requested");
                }
            }
        }
        Command::Rendezvous(cfg) => {
            let metrics = soma_rendezvous::RendezvousMetrics::new();
            let http = tokio::spawn({
                let svc = RendezvousHttpService {
                    http_addr: cfg.http_addr,
                    metrics: metrics.clone(),
                };
                async move { HttpServer::new(svc).run().await.map_err(Error::http) }
            });

            let svc = tokio::spawn(
                async move { soma_rendezvous::run(Default::default(), metrics).await },
            );

            tokio::select! {
                res = http => res??,
                res = svc => res??,
                _ = tokio::signal::ctrl_c() => {
                    tracing::info!("shutdown requested");
                }
            }
        }
        Command::Bff(cfg) => {
            let svc = BffHttpService { http_addr: cfg.http_addr };
            HttpServer::new(svc).run().await?;
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

#[derive(Clone, Copy)]
struct BffHttpService {
    http_addr: std::net::SocketAddr,
}

impl HttpService for BffHttpService {
    fn addr(&self) -> std::net::SocketAddr {
        self.http_addr
    }

    fn router(self) -> axum::Router {
        soma_bff::app().merge(soma_metrics::router("bff"))
    }
}
