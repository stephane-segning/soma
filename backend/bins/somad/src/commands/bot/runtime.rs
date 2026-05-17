use std::sync::Arc;

use soma_core::SomaResult;
use soma_membership::JoinPolicy;
use soma_net::IdentityManager;
use soma_peer::PeerCommand;
use soma_vdfs::BlobProvider;
use tracing::{info, warn};

use crate::commands::bot::{
    config::{Args, BotConfig, Command, Mode},
    http::{self, BotInfo, BotState},
    metrics::BotMetrics,
};
use bootstrap::BotPeerBootstrap;
use dispatcher::{build_dispatcher, spawn_mailbox_sweeper};
use soma_peer::bootstrap::PeerLauncher;
use soma_vdfs::fs::FsBlobStore;

mod bootstrap;
mod dispatcher;

/// Entry point for `somad bot`. Handles the `generate-identity` short-circuit
/// then dispatches to [`run_bot`].
pub async fn run(args: Args) -> anyhow::Result<()> {
    let idm = IdentityManager::from_env();

    if let Some(Command::GenerateIdentity { path }) = args.cmd {
        let path = path.unwrap_or_else(|| idm.default_identity_path("bot"));
        let id = idm.generate(&path).map_err(|e| anyhow::anyhow!(e))?;
        info!(?path, peer_id = %id.peer_id(), "generated bot identity");
        return Ok(());
    }

    let config = BotConfig::from_args(&args);
    let metrics = BotMetrics::new();

    run_bot(config, metrics).await.map_err(|e| anyhow::anyhow!(e))
}

/// Run the bot: spawn peer + HTTP server, dispatch peer events until shutdown.
pub async fn run_bot(config: BotConfig, metrics: BotMetrics) -> SomaResult<()> {
    std::fs::create_dir_all(&config.blob_dir)?;
    let blob_store = FsBlobStore::new(config.blob_dir.clone());
    let blob_provider: Arc<dyn BlobProvider> = Arc::new(blob_store.clone());

    // DB: allow postgres or sqlite URL, default to sqlite file path.
    static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../../crates/storage/migrations");

    let db_scheme = db_scheme(&config.db_url);
    info!(scheme = %db_scheme, url = %config.db_url, "configuring database");
    let repos = soma_storage::bootstrap::connect_any(&config.db_url, &MIGRATOR).await?;
    let join_policy = if matches!(config.mode, Mode::Admin) {
        JoinPolicy::manual_only()
    } else {
        JoinPolicy::bot_auto()
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

fn db_scheme(url: &str) -> &'static str {
    if url.starts_with("postgres://") || url.starts_with("postgresql://") {
        "postgres"
    } else if url.starts_with("sqlite:") || url.ends_with(".db") {
        "sqlite"
    } else {
        "unknown"
    }
}
