//! `somad all` — compose multiple subcommands in one process.
//!
//! Reads a TOML config that declares which modes to enable and with what
//! options. Replaces the former `bins/serverd` (which only dispatched one
//! mode at a time despite the name); now actually composes.
//!
//! Example `server.toml`:
//!
//! ```toml
//! [relay]
//! http_addr = "0.0.0.0:8081"
//!
//! [rendezvous]
//! http_addr = "0.0.0.0:8082"
//!
//! [bff]
//! http_addr = "0.0.0.0:8083"
//! ```
//!
//! Missing sections are simply skipped. Bot mode is **not** yet supported in
//! `all` because of its SQLx + signing setup; run `somad bot` in its own
//! process for now.

use std::net::SocketAddr;
use std::path::PathBuf;

use serde::Deserialize;
use soma_core::http::{HttpServer, HttpService};
use tracing::{info, warn};

#[derive(Debug, clap::Args)]
pub struct Args {
    /// Path to the TOML config file describing which services to run.
    #[arg(long, env = "SOMAD_ALL_CONFIG")]
    pub config: PathBuf,
}

#[derive(Debug, Deserialize)]
struct ComposeConfig {
    #[serde(default)]
    relay: Option<RelayConfig>,
    #[serde(default)]
    rendezvous: Option<RendezvousConfig>,
    #[serde(default)]
    bff: Option<BffConfig>,
}

#[derive(Debug, Deserialize)]
struct RelayConfig {
    #[serde(default = "default_relay_addr")]
    http_addr: SocketAddr,
}

#[derive(Debug, Deserialize)]
struct RendezvousConfig {
    #[serde(default = "default_rendezvous_addr")]
    http_addr: SocketAddr,
}

#[derive(Debug, Deserialize)]
struct BffConfig {
    #[serde(default = "default_bff_addr")]
    http_addr: SocketAddr,
}

fn default_relay_addr() -> SocketAddr {
    "0.0.0.0:8081".parse().unwrap()
}
fn default_rendezvous_addr() -> SocketAddr {
    "0.0.0.0:8082".parse().unwrap()
}
fn default_bff_addr() -> SocketAddr {
    "0.0.0.0:8083".parse().unwrap()
}

pub async fn run(args: Args) -> anyhow::Result<()> {
    let text = std::fs::read_to_string(&args.config)
        .map_err(|e| anyhow::anyhow!("read config {}: {e}", args.config.display()))?;
    let config: ComposeConfig = toml::from_str(&text)
        .map_err(|e| anyhow::anyhow!("parse config {}: {e}", args.config.display()))?;

    let mut tasks: Vec<tokio::task::JoinHandle<anyhow::Result<()>>> = Vec::new();

    if let Some(cfg) = config.relay {
        info!(http_addr = %cfg.http_addr, "composing relay");
        let metrics = soma_relay::RelayMetrics::new();
        let http_addr = cfg.http_addr;
        let metrics_for_http = metrics.clone();
        tasks.push(tokio::spawn(async move {
            HttpServer::new(RelayHttpService {
                http_addr,
                metrics: metrics_for_http,
            })
            .run()
            .await
            .map_err(|e| anyhow::anyhow!(e))
        }));
        tasks.push(tokio::spawn(async move {
            soma_relay::run(Default::default(), metrics)
                .await
                .map_err(|e| anyhow::anyhow!(e))
        }));
    }

    if let Some(cfg) = config.rendezvous {
        info!(http_addr = %cfg.http_addr, "composing rendezvous");
        let metrics = soma_rendezvous::RendezvousMetrics::new();
        let http_addr = cfg.http_addr;
        let metrics_for_http = metrics.clone();
        tasks.push(tokio::spawn(async move {
            HttpServer::new(RendezvousHttpService {
                http_addr,
                metrics: metrics_for_http,
            })
            .run()
            .await
            .map_err(|e| anyhow::anyhow!(e))
        }));
        tasks.push(tokio::spawn(async move {
            soma_rendezvous::run(Default::default(), metrics)
                .await
                .map_err(|e| anyhow::anyhow!(e))
        }));
    }

    if let Some(cfg) = config.bff {
        info!(http_addr = %cfg.http_addr, "composing bff");
        let http_addr = cfg.http_addr;
        tasks.push(tokio::spawn(async move {
            HttpServer::new(BffHttpService { http_addr })
                .run()
                .await
                .map_err(|e| anyhow::anyhow!(e))
        }));
    }

    if tasks.is_empty() {
        warn!("no services declared in {}; exiting", args.config.display());
        return Ok(());
    }

    let mut futures: futures::stream::FuturesUnordered<_> = tasks.into_iter().collect();
    use futures::StreamExt;

    tokio::select! {
        Some(res) = futures.next() => {
            res??;
        }
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

#[derive(Clone, Copy)]
struct BffHttpService {
    http_addr: SocketAddr,
}
impl HttpService for BffHttpService {
    fn addr(&self) -> SocketAddr {
        self.http_addr
    }
    fn router(self) -> axum::Router {
        soma_bff::app().merge(soma_metrics::router("bff"))
    }
}
