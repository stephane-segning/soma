use clap::Parser;
use mimalloc::MiMalloc;
use soma_core::SomaResult;
use soma_net::{default_identity_path, generate_identity};
use soma_peer::{PeerCommand, PeerConfig, PeerEvent, spawn_ping_peer};
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

use config::{Args, BotConfig, Command};
use metrics::{BotMetrics, PingLabels};

mod config;
mod http;
mod metrics;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[tokio::main]
async fn main() -> SomaResult<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let args = Args::parse();

    if let Some(Command::GenerateIdentity { path }) = args.cmd {
        let path = path.unwrap_or_else(|| default_identity_path("bot"));
        let id = generate_identity(&path)?;
        println!(
            "generated bot identity at {:?}, peer_id={}",
            path,
            id.peer_id()
        );
        return Ok(());
    }

    let config = BotConfig::from_args(&args);
    let metrics = BotMetrics::new();

    run(config, metrics).await
}

async fn run(config: BotConfig, metrics: BotMetrics) -> SomaResult<()> {
    std::fs::create_dir_all(&config.blob_dir)?;

    let peer_config = PeerConfig::builder()
        .identity_path(config.identity_path.clone())
        .listen_addrs(config.listen_addrs.clone())
        .bootstrap_addrs(config.bootstrap_addrs.clone())
        .rendezvous_nodes(config.rendezvous_addrs.clone())
        .relay_addrs(config.relay_addrs.clone())
        .enable_mdns(config.enable_mdns)
        .build()
        .expect("peer config");
    let peer = spawn_ping_peer(peer_config)?;
    let peer_id = peer.peer_id;

    info!(
        %peer_id,
        http_addr = %config.http_addr,
        blob_dir = %config.blob_dir.display(),
        "starting soma-botd"
    );

    let http_handle = tokio::spawn({
        let state = http::BotState {
            info: http::BotInfo {
                peer_id: peer_id.to_string(),
                blob_dir: config.blob_dir.clone(),
            },
            issuer_peer_id: peer_id.to_string(),
            metrics: metrics.clone(),
        };
        async move { http::serve_http(config.http_addr, state).await }
    });
    let peer_task = peer.task;
    let mut peer_events = peer.events;
    tokio::pin!(peer_task);
    tokio::pin!(http_handle);

    loop {
        tokio::select! {
            evt = peer_events.recv() => {
                if let Some(evt) = evt {
                    handle_peer_event(&metrics, evt).await;
                } else {
                    break;
                }
            }
            res = &mut peer_task => {
                res??;
                break;
            }
            res = &mut http_handle => {
                res??;
                break;
            }
            _ = tokio::signal::ctrl_c() => {
                warn!("botd shutdown requested");
                let _ = peer.commands.send(PeerCommand::Shutdown).await;
                break;
            }
        }
    }

    Ok(())
}

async fn handle_peer_event(metrics: &BotMetrics, evt: PeerEvent) {
    match evt {
        PeerEvent::NewListenAddr { address, peer_id } => {
            metrics.listeners.get_or_create(&()).inc();
            info!(%peer_id, listen_addr=%address, "bot listening");
        }
        PeerEvent::PingOk { rtt } => {
            metrics.pings.get_or_create(&PingLabels { outcome: "ok" }).inc();
            info!(?rtt, "ping success");
        }
        PeerEvent::PingErr { error } => {
            metrics.pings.get_or_create(&PingLabels { outcome: "error" }).inc();
            warn!(%error, "ping error");
        }
        PeerEvent::ConnectionEstablished { peer } => {
            info!(%peer, "bot connection established");
        }
        PeerEvent::ConnectionError { peer, error } => {
            warn!(?peer, %error, "bot connection error");
        }
        PeerEvent::IdentifyReceived { peer, agent, protocols } => {
            info!(%peer, %agent, protocols, "bot identify received");
        }
        PeerEvent::MdnsDiscovered { peers } => {
            info!(peers, "bot mdns discovered peers");
        }
        PeerEvent::RendezvousDiscovered { registrations } => {
            info!(registrations, "bot rendezvous discovered");
        }
        PeerEvent::RelayReserved { relay } => {
            info!(%relay, "bot relay reservation accepted");
        }
        PeerEvent::RelayCircuitEstablished { relay } => {
            info!(%relay, "bot relay circuit established");
        }
        PeerEvent::ListenerClosed { reason } => {
            warn!(?reason, "bot listener closed");
        }
        PeerEvent::JoinRequestSubmitted { .. } => {}
        PeerEvent::JoinDecision { .. } => {}
        PeerEvent::JoinFailed { .. } => {}
    }
}
