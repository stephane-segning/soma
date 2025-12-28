use std::path::{Path, PathBuf};
use std::sync::Arc;

use clap::Parser;
use soma_core::SomaResult;
use soma_membership::{JoinPolicy, build_join_decider};
use soma_net::IdentityManager;
use soma_peer::{
    PeerCommand, PeerConfig,
    events::{PeerEventDispatcher, PeerEventHandler, handler_with_queue},
};
use soma_vdfs::BlobProvider;
use std::time::Duration;
use tokio::task::JoinHandle;
use tracing::{info, warn};

use crate::{
    config::{Args, BotConfig, Command, Mode},
    event_handlers,
    http::{self, BotInfo, BotState},
    metrics::BotMetrics,
};
use soma_net::NetIdentity;
use soma_peer::bootstrap::{PeerBootstrapper, PeerLauncher};
use soma_vdfs::fs::FsBlobStore;

/// Build configuration from CLI args and run the bot runtime.
pub async fn run_from_cli() -> SomaResult<()> {
    let args = Args::parse();

    let idm = IdentityManager::from_env();

    if let Some(Command::GenerateIdentity { path }) = args.cmd {
        let path = path.unwrap_or_else(|| idm.default_identity_path("bot"));
        let id = idm.generate(&path)?;
        info!(
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
    let blob_store = FsBlobStore::new(config.blob_dir.clone());
    let blob_provider: Arc<dyn BlobProvider> = Arc::new(blob_store.clone());

    // DB: allow postgres or sqlite URL, default to sqlite file path.
    static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../../crates/storage/migrations");

    let db_scheme = db_scheme(&config.db_url);
    info!(scheme = %db_scheme, url = %config.db_url, "configuring database");
    let repos = soma_storage::bootstrap::connect_any(&config.db_url, &MIGRATOR).await?;
    let join_policy = if matches!(config.mode, Mode::Bot) {
        JoinPolicy::bot_auto()
    } else {
        JoinPolicy::manual_only()
    };

    let bootstrapper = BotPeerBootstrap {
        identity_path: config.identity_path.clone(),
        config: config.clone(),
        blob_provider: blob_provider.clone(),
        repos: repos.clone(),
        join_policy,
    };

    let (peer, net_identity) = PeerLauncher::new(&bootstrapper).spawn()?;
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
    soma_membership::outbox::sweep_due(&state.repos, &state.peer_id, &state.peer_commands).await;
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

struct BotPeerBootstrap {
    identity_path: PathBuf,
    config: BotConfig,
    blob_provider: Arc<dyn BlobProvider>,
    repos: soma_storage::RepositoryFactory,
    join_policy: JoinPolicy,
}

impl PeerBootstrapper for BotPeerBootstrap {
    fn identity_path(&self) -> &Path {
        &self.identity_path
    }

    fn build_config(&self, identity: &NetIdentity) -> PeerConfig {
        let join_decider = build_join_decider(
            &self.repos,
            identity.keypair().clone(),
            identity.peer_id(),
            self.join_policy,
        );

        PeerConfig::builder()
            .identity_path(self.identity_path.clone())
            .listen_addrs(self.config.listen_addrs.clone())
            .bootstrap_addrs(self.config.bootstrap_addrs.clone())
            .rendezvous_nodes(self.config.rendezvous_addrs.clone())
            .relay_addrs(self.config.relay_addrs.clone())
            .enable_mdns(self.config.enable_mdns)
            .join_decider(join_decider.clone())
            .blob_provider(self.blob_provider.clone())
            .build()
            .expect("peer config")
    }
}
