use std::sync::Arc;

use clap::Parser;
use soma_core::SomaResult;
use soma_net::{default_identity_path, generate_identity};
use soma_peer::{
    PeerCommand, PeerConfig,
    events::{PeerEventDispatcher, PeerEventHandler, handler_with_queue},
    spawn_ping_peer,
};
use tokio::task::JoinHandle;
use tracing::{info, warn};

use crate::{
    config::{Args, BotConfig, Command},
    event_handlers,
    http::{self, BotInfo},
    join::BotJoinDecider,
    metrics::BotMetrics,
};

/// Build configuration from CLI args and run the bot runtime.
pub async fn run_from_cli() -> SomaResult<()> {
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

/// Run botd: spawn peer + HTTP server, then dispatch peer events until shutdown.
pub async fn run(config: BotConfig, metrics: BotMetrics) -> SomaResult<()> {
    std::fs::create_dir_all(&config.blob_dir)?;

    // DB: allow postgres or sqlite URL, default to sqlite file path.
    static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../../crates/storage/migrations");

    let db_scheme = db_scheme(&config.database_url);
    info!(scheme = %db_scheme, url = %config.database_url, "configuring database");
    let repos = soma_storage::bootstrap::connect_any(&config.database_url, &MIGRATOR).await?;
    let join_decider = BotJoinDecider::new(&repos);

    let peer_config = PeerConfig::builder()
        .identity_path(config.identity_path.clone())
        .listen_addrs(config.listen_addrs.clone())
        .bootstrap_addrs(config.bootstrap_addrs.clone())
        .rendezvous_nodes(config.rendezvous_addrs.clone())
        .relay_addrs(config.relay_addrs.clone())
        .enable_mdns(config.enable_mdns)
        .join_decider(join_decider.clone())
        .build()
        .expect("peer config");

    let peer = spawn_ping_peer(peer_config)?;
    let peer_id = peer.peer_id;

    info!(
        %peer_id,
        mode = ?config.mode,
        http_addr = %config.http_addr,
        blob_dir = %config.blob_dir.display(),
        "starting soma-botd"
    );

    let http_handle = tokio::spawn({
        let state = http::BotState {
            info: BotInfo {
                peer_id: peer_id.to_string(),
                blob_dir: config.blob_dir.clone(),
            },
            metrics: metrics.clone(),
            join_decider: join_decider.clone(),
        };
        async move {
            http::serve_http(
                config.http_addr,
                config.mode,
                config.admin_token.clone(),
                state,
            )
            .await
        }
    });
    let peer_task = peer.task;
    let mut peer_events = peer.events;

    let dispatcher = build_dispatcher(metrics.clone());

    tokio::pin!(peer_task);
    tokio::pin!(http_handle);

    loop {
        tokio::select! {
            evt = peer_events.recv() => {
                if let Some(evt) = evt {
                    dispatcher.dispatch(&metrics, &evt).await;
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

fn build_dispatcher(metrics: BotMetrics) -> PeerEventDispatcher<BotMetrics> {
    const QUEUE_CAPACITY: usize = 64;

    let handlers = event_handlers::build_handlers();
    let shared = Arc::new(metrics);
    let (queued_handlers, tasks) = wrap_with_queues(shared.clone(), handlers, QUEUE_CAPACITY);

    tokio::spawn(async move {
        for task in tasks {
            let _ = task.await;
        }
    });

    PeerEventDispatcher::new(queued_handlers)
}

fn wrap_with_queues<Ctx>(
    ctx: Arc<Ctx>,
    handlers: Vec<Arc<dyn PeerEventHandler<Ctx>>>,
    capacity: usize,
) -> (Vec<Arc<dyn PeerEventHandler<Ctx>>>, Vec<JoinHandle<()>>)
where
    Ctx: Send + Sync + 'static,
{
    let mut wrapped = Vec::with_capacity(handlers.len());
    let mut tasks = Vec::with_capacity(handlers.len());

    for handler in handlers {
        let (queued, task) = handler_with_queue(ctx.clone(), handler, capacity);
        wrapped.push(queued);
        tasks.push(task);
    }

    (wrapped, tasks)
}

fn db_scheme(url: &str) -> &'static str {
    if url.starts_with("postgres://") || url.starts_with("postgresql://") {
        "postgres"
    } else if url.starts_with("sqlite:") || url.ends_with(".db") {
        "sqlite"
    } else {
        "unknown"
    }
}
