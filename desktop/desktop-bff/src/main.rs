//! `desktop-bff` binary entry point.
//!
//! Boots the same runtimes the Tauri shell boots (daemon + agent +
//! practice), wires them into a shared `AppState`, then serves the axum
//! router from [`desktop_bff::build_router`]. No webview, no splash, no
//! deep-link handling — that's the Tauri shell's job.
//!
//! Environment variables:
//! - `SOMA_BFF_BIND` — listener socket (default `127.0.0.1:4123`).
//! - `SOMA_BFF_ALLOWED_ORIGINS` — comma-separated list of CORS origins
//!   that may issue credentialed cross-origin requests. Empty (default)
//!   means no CORS layer is installed — same-origin only. Set this when
//!   serving the SDK from a different origin than the BFF.
//! - `SOMA_BFF_USER_DATA_DIR` — explicit on-disk data root. When unset
//!   we fall back to the platform's standard data directory (via
//!   `dirs::data_local_dir()`).

use std::env;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Context;
use axum::http::HeaderValue;
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

    // Kick the runtimes off independently. `start()` schedules each
    // runtime's internal event loop on the tokio scheduler and resolves
    // once the setup is done, but the two are independent — spawning
    // them in separate tasks means agent startup doesn't have to wait
    // for daemon startup (and vice versa) and a long-blocking
    // `start()` in one doesn't starve the other.
    {
        let daemon = Arc::clone(&daemon);
        tokio::spawn(async move {
            if let Err(err) = daemon.start().await {
                tracing::error!(?err, "daemon runtime failed to start");
            }
        });
    }
    {
        let agent_runtime = Arc::clone(&agent_runtime);
        tokio::spawn(async move {
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

    let config = resolve_config()?;
    let router = build_router(state, &config);

    let listener = TcpListener::bind(config.bind_addr)
        .await
        .with_context(|| format!("bind {}", config.bind_addr))?;
    tracing::info!(addr = %config.bind_addr, "desktop-bff listening");
    if config.allowed_origins.is_empty() {
        tracing::info!("CORS: same-origin only (set SOMA_BFF_ALLOWED_ORIGINS for cross-origin SDK access)");
    } else {
        tracing::info!(origins = ?config.allowed_origins, "CORS: credentialed allowlist active");
    }

    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("axum serve")?;

    Ok(())
}

/// Build a [`BffConfig`] from environment variables. All inputs are
/// optional; we fall back to safe defaults that match what
/// `BffConfig::default()` produces. We parse here (in `main`) rather
/// than burying env reads inside `BffConfig::default()` so the public
/// `BffConfig` API stays pure data and integration tests can pass it
/// in by hand.
fn resolve_config() -> anyhow::Result<BffConfig> {
    let mut cfg = BffConfig::default();

    if let Ok(raw) = env::var("SOMA_BFF_BIND") {
        cfg.bind_addr = raw.parse::<SocketAddr>().with_context(|| {
            format!("SOMA_BFF_BIND must be a valid socket address (e.g. '127.0.0.1:4123'), got {raw:?}")
        })?;
    }

    if let Ok(raw) = env::var("SOMA_BFF_ALLOWED_ORIGINS") {
        cfg.allowed_origins = raw
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|origin| {
                HeaderValue::from_str(origin)
                    .with_context(|| format!("SOMA_BFF_ALLOWED_ORIGINS contains invalid header value {origin:?}"))
            })
            .collect::<anyhow::Result<Vec<_>>>()?;
    }

    Ok(cfg)
}

/// Resolve the on-disk user-data dir. Tauri uses `tauri::path::app_data_dir`;
/// the BFF doesn't have that plugin, so we read `SOMA_BFF_USER_DATA_DIR`
/// and fall back to the platform's standard data directory:
/// - Linux: `$XDG_DATA_HOME/soma-bff` or `~/.local/share/soma-bff`
/// - macOS: `~/Library/Application Support/soma-bff`
/// - Windows: `%LOCALAPPDATA%\soma-bff`
///
/// Only the last-resort fallback (when the platform doesn't expose a
/// data dir at all, which shouldn't happen on any supported target)
/// lands on the cwd, and that path is logged loudly so misconfigured
/// containers don't silently store data in the wrong place.
fn resolve_user_data_dir() -> anyhow::Result<PathBuf> {
    if let Ok(dir) = env::var("SOMA_BFF_USER_DATA_DIR") {
        return Ok(PathBuf::from(dir));
    }
    if let Some(base) = dirs::data_local_dir() {
        return Ok(base.join("soma-bff"));
    }
    let cwd = env::current_dir().context("current_dir")?;
    let fallback = cwd.join(".soma-bff-data");
    eprintln!(
        "warn: dirs::data_local_dir() returned None; falling back to {} — set SOMA_BFF_USER_DATA_DIR to override",
        fallback.display()
    );
    Ok(fallback)
}

/// Graceful shutdown trigger. Listens for Ctrl-C (SIGINT) on every
/// platform and additionally for SIGTERM on Unix so container
/// orchestrators (Docker, Kubernetes, systemd) can stop the binary
/// cleanly without waiting out the kill timeout.
async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        use tokio::signal::unix::{SignalKind, signal};
        match signal(SignalKind::terminate()) {
            Ok(mut s) => {
                s.recv().await;
            }
            Err(err) => {
                tracing::warn!(?err, "SIGTERM handler install failed; falling back to Ctrl-C only");
                std::future::pending::<()>().await;
            }
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => tracing::info!("shutdown signal received (Ctrl-C)"),
        _ = terminate => tracing::info!("shutdown signal received (SIGTERM)"),
    }
}
