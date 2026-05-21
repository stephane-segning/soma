//! `desktop-bff` binary entry point.
//!
//! Boots the same runtimes the Tauri shell boots (daemon + agent +
//! practice), wires them into a shared `AppState`, then serves the axum
//! router from [`desktop_bff::build_router`]. No webview, no splash, no
//! deep-link handling — that's the Tauri shell's job.

use std::env;
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Context;
use desktop_agent::config::AgentRuntimeConfig;
use desktop_agent::runtime::AgentRuntime;
use desktop_agent::service::{AgentService, StaticConfigSource};
use desktop_api::{AppState, DOMAIN_EVENT_CHANNEL_CAPACITY};
use desktop_bff::{BffConfig, build_router};
use desktop_daemon::runtime::{DaemonRuntime, DaemonRuntimeOptions};
use desktop_services::logger::{self, LoggerOptions};
use desktop_services::practice::PracticeService;
use tokio::net::TcpListener;
use tokio::sync::broadcast;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let user_data_dir = resolve_user_data_dir()?;
    let logs_dir = user_data_dir.join("logs");

    // Hold the logger guards for the lifetime of the process — see the
    // doc-comment on `LoggerGuards`.
    let _logger_guards = logger::init(LoggerOptions {
        log_dir: &logs_dir,
        is_dev: cfg!(debug_assertions),
    })
    .context("logger init")?;

    tracing::info!(?user_data_dir, "desktop-bff starting");

    let daemon = Arc::new(DaemonRuntime::new(DaemonRuntimeOptions::new(&user_data_dir)));
    let agent_runtime = Arc::new(AgentRuntime::new());

    // The BFF has no `tauri-plugin-store` to read agent config from; until
    // the BFF grows a real settings surface, we hand it the static
    // defaults. Same shape the Tauri shell would normalize to from an
    // empty store value.
    let config_source = Arc::new(StaticConfigSource(AgentRuntimeConfig::default()));
    let agent_service = AgentService::new(config_source, Arc::clone(&agent_runtime));
    let practice = Arc::new(PracticeService::new());

    let (domain_events_tx, _initial_rx) = broadcast::channel(DOMAIN_EVENT_CHANNEL_CAPACITY);

    // Kick off the daemon + agent startup off the request path. SSE
    // subscribers will see daemon-source events once the firehose bridge
    // is wired up in a follow-up; the renderer-source channel works as
    // soon as the channel is constructed (i.e. right now).
    {
        let daemon = Arc::clone(&daemon);
        let agent_runtime = Arc::clone(&agent_runtime);
        tokio::spawn(async move {
            if let Err(err) = daemon.start().await {
                tracing::error!(?err, "daemon runtime failed to start");
            }
            if let Err(err) = agent_runtime.start().await {
                tracing::error!(?err, "agent runtime failed to start");
            }
        });
    }

    let state = Arc::new(AppState::new(
        daemon,
        agent_runtime,
        agent_service,
        practice,
        domain_events_tx,
    ));

    let config = BffConfig::default();
    let router = build_router(state);

    let listener = TcpListener::bind(config.bind_addr)
        .await
        .with_context(|| format!("bind {}", config.bind_addr))?;
    tracing::info!(addr = %config.bind_addr, "desktop-bff listening");

    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("axum serve")?;

    Ok(())
}

/// Resolve the on-disk user-data dir. Tauri uses `tauri::path::app_data_dir`;
/// the BFF doesn't have that plugin, so we read `SOMA_BFF_USER_DATA_DIR`
/// and fall back to `<cwd>/.soma-bff-data` for local dev.
fn resolve_user_data_dir() -> anyhow::Result<PathBuf> {
    if let Ok(dir) = env::var("SOMA_BFF_USER_DATA_DIR") {
        return Ok(PathBuf::from(dir));
    }
    let cwd = env::current_dir().context("current_dir")?;
    Ok(cwd.join(".soma-bff-data"))
}

async fn shutdown_signal() {
    // Same shape Tauri uses — wait for SIGINT (Ctrl-C). SIGTERM handling
    // can land alongside the systemd unit when we package this binary.
    let _ = tokio::signal::ctrl_c().await;
    tracing::info!("shutdown signal received");
}
