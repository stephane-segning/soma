use std::sync::Arc;

use clap::Parser;
use soma_core::SomaResult;
use soma_membership::{JoinPolicy, build_join_decider};
use soma_net::{default_identity_path, generate_identity, NetIdentity};
use soma_peer::{
    PeerCommand, PeerConfig,
    events::{PeerEventDispatcher, PeerEventHandler, handler_with_queue},
    spawn_ping_peer,
};
use tokio::task::JoinHandle;
use tracing::{info, warn};
use std::time::{Duration, SystemTime};
use soma_membership::{MAILBOX_KIND_JOIN_DECISION, MAILBOX_KIND_JOIN_REQUEST, decode_outgoing_join_request_payload};
use soma_proto_build::spaceroom::JoinDecision;
use soma_storage::mailbox::MailboxRepository;
use libp2p::Multiaddr;
use prost::Message;

use crate::{
    config::{Args, BotConfig, Command, Mode},
    event_handlers,
    http::{self, BotInfo, BotState},
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
    let net_identity = NetIdentity::load_or_generate(&config.identity_path)?;
    let join_decider = build_join_decider(
        &repos,
        net_identity.keypair().clone(),
        net_identity.peer_id(),
        if matches!(config.mode, Mode::Bot) {
            JoinPolicy::bot_auto()
        } else {
            JoinPolicy::manual_only()
        },
    );

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

    let state = Arc::new(BotState {
        info: BotInfo {
            peer_id: peer_id.to_string(),
            blob_dir: config.blob_dir.clone(),
        },
        peer_id,
        metrics: metrics.clone(),
        repos: repos.clone(),
        signer: net_identity.keypair().clone(),
        peer_commands: peer.commands.clone(),
    });

    let http_handle = tokio::spawn({
        let state = (*state).clone();
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

    let dispatcher = build_dispatcher(state.clone());
    spawn_mailbox_sweeper(state.clone());

    tokio::pin!(peer_task);
    tokio::pin!(http_handle);

    loop {
        tokio::select! {
            evt = peer_events.recv() => {
                if let Some(evt) = evt {
                    dispatcher.dispatch(state.as_ref(), &evt).await;
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

fn spawn_mailbox_sweeper(state: Arc<BotState>) {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(5 * 60)).await;
            sweep_mailbox(state.as_ref()).await;
        }
    });
}

async fn sweep_mailbox(state: &BotState) {
    let now_secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let _ = state.repos.mailbox().requeue_expired_leases(now_secs).await;

    let entries = match state.repos.mailbox().list_due(now_secs, 50).await {
        Ok(entries) => entries,
        Err(err) => {
            warn!(%err, "mailbox sweep failed to list entries");
            return;
        }
    };

    for entry in entries {
        match entry.kind.as_str() {
            MAILBOX_KIND_JOIN_DECISION => {
                let Some(subject_peer_id) = entry.subject_peer_id.clone() else {
                    let _ = state.repos.mailbox().mark_dead(&entry.id).await;
                    continue;
                };
                let Ok(target) = subject_peer_id.parse() else {
                    let _ = state.repos.mailbox().mark_dead(&entry.id).await;
                    continue;
                };

                let lease_until = now_secs + 30;
                let leased = match state
                    .repos
                    .mailbox()
                    .lease(&entry.id, &state.peer_id.to_string(), lease_until)
                    .await
                {
                    Ok(rows) => rows,
                    Err(_) => continue,
                };
                if leased == 0 {
                    continue;
                }

                let Some(payload) = entry.payload.clone() else {
                    let _ = state.repos.mailbox().mark_dead(&entry.id).await;
                    continue;
                };
                let Ok(decision) = JoinDecision::decode(payload.as_slice()) else {
                    let _ = state.repos.mailbox().mark_dead(&entry.id).await;
                    continue;
                };

                let _ = state
                    .peer_commands
                    .send(PeerCommand::SendJoinDecision {
                        target,
                        addrs: Vec::new(),
                        delivery_id: entry.id.clone(),
                        decision,
                    })
                    .await;
            }
            MAILBOX_KIND_JOIN_REQUEST => {
                let Some(subject_peer_id) = entry.subject_peer_id.clone() else {
                    let _ = state.repos.mailbox().mark_dead(&entry.id).await;
                    continue;
                };
                let Ok(target) = subject_peer_id.parse() else {
                    let _ = state.repos.mailbox().mark_dead(&entry.id).await;
                    continue;
                };

                let lease_until = now_secs + 30;
                let leased = match state
                    .repos
                    .mailbox()
                    .lease(&entry.id, &state.peer_id.to_string(), lease_until)
                    .await
                {
                    Ok(rows) => rows,
                    Err(_) => continue,
                };
                if leased == 0 {
                    continue;
                }

                let Some(payload) = entry.payload.clone() else {
                    let _ = state.repos.mailbox().mark_dead(&entry.id).await;
                    continue;
                };
                let outgoing = match decode_outgoing_join_request_payload(&payload) {
                    Ok(o) => o,
                    Err(_) => {
                        let _ = state.repos.mailbox().mark_dead(&entry.id).await;
                        continue;
                    }
                };

                let mut addrs = Vec::new();
                for addr in outgoing.addrs {
                    if let Ok(parsed) = addr.parse::<Multiaddr>() {
                        addrs.push(parsed);
                    }
                }

                let _ = state
                    .peer_commands
                    .send(PeerCommand::SendJoinRequest {
                        target,
                        addrs,
                        delivery_id: entry.id.clone(),
                        request_id: outgoing.request_id,
                        request: outgoing.request,
                    })
                    .await;
            }
            _ => {}
        }
    }
}

fn build_dispatcher(state: Arc<BotState>) -> PeerEventDispatcher<BotState> {
    const QUEUE_CAPACITY: usize = 64;

    let handlers = event_handlers::build_handlers();
    let (queued_handlers, tasks) = wrap_with_queues(state.clone(), handlers, QUEUE_CAPACITY);

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
