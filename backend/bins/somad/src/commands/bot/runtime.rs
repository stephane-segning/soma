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
    // Before any I/O (no blob dir created, no DB connection, no libp2p
    // listener bound) — see `validate_admin_mode_token`'s doc comment for
    // why this must be unconditional, matching `desktop-bff`'s
    // `resolve_config` fail-closed gate for the identical class of bug.
    validate_admin_mode_token(&config)?;
    let metrics = BotMetrics::new();

    run_bot(config, metrics)
        .await
        .map_err(|e| anyhow::anyhow!(e))
}

/// `--mode admin` exposes an authenticated control plane — including
/// `/v1/spaces/issuer-capability/import`, which base64-decodes arbitrary
/// caller-supplied capability bytes straight into local storage. An
/// admin-mode process with no configured token has every one of those
/// write endpoints open to anyone who can reach the HTTP port:
/// `http::auth::authorize` treats an absent `expected` token as "allow
/// everyone" (see its doc comment) — a deliberate default for `bot` mode
/// (which has no admin routes at all) that silently becomes a wide-open
/// admin surface the moment `--mode admin` is added without also setting
/// `--admin-token`/`SOMA_ADMIN_TOKEN`, with no warning at startup.
/// Refuse to start rather than silently serve that.
///
/// Unconditional — not just "when `--http-addr` binds a non-loopback
/// address". The default `--http-addr` is `0.0.0.0:8080` (see
/// `config.rs`), and `0.0.0.0` is ambiguous about actual reachability
/// (container port mapping, reverse proxies, and firewalls all sit
/// outside this process's view). `desktop-bff`'s `resolve_config` makes
/// the identical call for `SOMA_BFF_TOKEN` and for the identical reason —
/// see its doc comment. A configuration that's safe today must not
/// silently become unsafe the moment someone flips `--mode bot` to
/// `--mode admin` without separately remembering to also set a token.
fn validate_admin_mode_token(config: &BotConfig) -> anyhow::Result<()> {
    let has_token = config
        .admin_token
        .as_deref()
        .map(|t| !t.is_empty())
        .unwrap_or(false);
    if config.mode == Mode::Admin && !has_token {
        anyhow::bail!(
            "refusing to start `somad bot --mode admin` without an admin token: set \
             --admin-token or SOMA_ADMIN_TOKEN. Admin mode exposes an authenticated write \
             control plane (including issuer-capability import) with no insecure/tokenless mode."
        );
    }
    Ok(())
}

/// Run the bot: spawn peer + HTTP server, dispatch peer events until shutdown.
pub async fn run_bot(config: BotConfig, metrics: BotMetrics) -> SomaResult<()> {
    std::fs::create_dir_all(&config.blob_dir)?;
    // `somad bot` is a VDF (cache-only) in both `bot` and `admin` mode, per
    // AGENTS.md's "Terminology: VDF" and "Blobs" sections: never a source
    // of truth. `new_cache_only` makes that structural — `write_local`
    // refuses rather than merely being unreachable because no upload
    // route exists yet.
    let blob_store = FsBlobStore::new_cache_only(config.blob_dir.clone());
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

#[cfg(test)]
mod tests {
    use super::*;

    fn base_config(mode: Mode, admin_token: Option<&str>) -> BotConfig {
        BotConfig {
            identity_path: std::path::PathBuf::from("/dev/null"),
            blob_dir: std::path::PathBuf::from("/dev/null"),
            db_url: "sqlite::memory:".into(),
            http_addr: "0.0.0.0:8080".parse().expect("valid addr"),
            listen_addrs: Vec::new(),
            bootstrap_addrs: Vec::new(),
            rendezvous_addrs: Vec::new(),
            relay_addrs: Vec::new(),
            enable_mdns: false,
            mode,
            admin_token: admin_token.map(str::to_string),
        }
    }

    #[test]
    fn bot_mode_never_requires_a_token() {
        // `bot` mode has no admin routes at all — nothing to gate.
        assert!(validate_admin_mode_token(&base_config(Mode::Bot, None)).is_ok());
    }

    #[test]
    fn admin_mode_without_a_token_is_refused() {
        let err = validate_admin_mode_token(&base_config(Mode::Admin, None))
            .expect_err("admin mode with no token must be refused");
        assert!(err.to_string().contains("admin token"));
    }

    #[test]
    fn admin_mode_with_a_blank_token_is_refused() {
        let err = validate_admin_mode_token(&base_config(Mode::Admin, Some("")))
            .expect_err("a blank token must be treated the same as no token");
        assert!(err.to_string().contains("admin token"));
    }

    #[test]
    fn admin_mode_with_a_real_token_is_allowed() {
        assert!(validate_admin_mode_token(&base_config(Mode::Admin, Some("secret"))).is_ok());
    }
}
