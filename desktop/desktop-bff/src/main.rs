//! `desktop-bff` binary entry point.
//!
//! Boots the same runtimes the Tauri shell boots (daemon + agent +
//! practice), wires them into a shared `AppState`, then serves the axum
//! router from [`desktop_bff::build_router`]. No webview, no splash, no
//! deep-link handling — that's the Tauri shell's job.
//!
//! Environment variables:
//! - `SOMA_BFF_BIND` — listener socket (default `127.0.0.1:4123`).
//! - `SOMA_BFF_TOKEN` — **required.** Bearer token every request must
//!   present (see `desktop_bff::auth`'s module doc for the full design
//!   and the two channels a client can present it through). The process
//!   refuses to start without one — this server is reachable remotely by
//!   design (that's the point of it), so there is no "just for loopback,
//!   auth optional" mode. Generate one with e.g. `openssl rand -hex 32`.
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
use desktop_agent::events as agent_events;
use desktop_agent::events::RuntimeEventStream;
use desktop_agent::runtime::AgentRuntime;
use desktop_agent::service::{AgentService, DbConfigSource};
use desktop_api::agent_config_store::DaemonBackedAgentConfigStore;
use desktop_api::{AGENT_EVENT_CHANNEL_CAPACITY, AppState, DOMAIN_EVENT_CHANNEL_CAPACITY};
use desktop_bff::{BffConfig, build_router};
use desktop_daemon::events as daemon_events;
use desktop_daemon::events::EventBridge;
use desktop_daemon::runtime::{DaemonRuntime, DaemonRuntimeOptions};
use desktop_services::logger::{self, LoggerOptions};
use desktop_services::practice::PracticeService;
use tokio::net::TcpListener;
use tokio::sync::{broadcast, watch};

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

    // Resolving config first (before touching the network or spawning
    // runtimes) means a missing `SOMA_BFF_TOKEN` fails fast — see
    // `resolve_config`'s doc comment for why this must be unconditional.
    let mut config = resolve_config()?;
    config.user_data_dir = user_data_dir.clone();

    let daemon = Arc::new(DaemonRuntime::new(DaemonRuntimeOptions::new(&user_data_dir)));
    let agent_runtime = Arc::new(AgentRuntime::new());

    // Agent config lives in the same SQLite database the embedded daemon
    // owns (one DB shared by both runtimes — see AGENTS.md's "Storage"
    // section), reached through `DaemonHandle`, not a Tauri store this
    // binary doesn't have. `DaemonBackedAgentConfigStore` re-fetches on
    // every call, same as the Tauri shell's wiring in
    // `desktop-app/src-tauri/src/lib.rs`.
    let config_source = Arc::new(DbConfigSource::new(Arc::new(DaemonBackedAgentConfigStore::new(Arc::clone(
        &daemon,
    )))));
    let agent_service = AgentService::new(config_source, Arc::clone(&agent_runtime));
    let practice = Arc::new(PracticeService::new());

    // Every domain/agent event this process will ever see, from every
    // source, flows onto these two channels — see
    // `desktop_api::state::AppState`'s doc comment ("one event pipeline,
    // two presenters"; the WebSocket route is this process's only
    // presenter, but it must see every source).
    let (domain_events_tx, _initial_domain_rx) = broadcast::channel(DOMAIN_EVENT_CHANNEL_CAPACITY);
    let (agent_events_tx, _initial_agent_rx) = broadcast::channel(AGENT_EVENT_CHANNEL_CAPACITY);

    let state = Arc::new(AppState::new(
        Arc::clone(&daemon),
        Arc::clone(&agent_runtime),
        Arc::clone(&agent_service),
        practice,
        domain_events_tx.clone(),
        agent_events_tx.clone(),
    ));

    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let router = build_router(state, &config, shutdown_rx);

    let listener = TcpListener::bind(config.bind_addr)
        .await
        .with_context(|| format!("bind {}", config.bind_addr))?;
    tracing::info!(addr = %config.bind_addr, "desktop-bff listening");
    if config.allowed_origins.is_empty() {
        tracing::info!("CORS: same-origin only (set SOMA_BFF_ALLOWED_ORIGINS for cross-origin SDK access)");
    } else {
        tracing::info!(origins = ?config.allowed_origins, "CORS: credentialed allowlist active");
    }

    // Three futures run concurrently for the rest of the process's life:
    // the daemon startup + its event bridge, the agent runtime startup +
    // its event poll, and the HTTP/WebSocket server itself. `tokio::join!`
    // (not two separate `tokio::spawn`s) keeps the `EventBridge` /
    // `RuntimeEventStream` handles alive in this stack frame for exactly
    // that lifetime — both types abort their background task on `Drop`,
    // so letting a bare `tokio::spawn(...)`'s return value fall out of
    // scope early would silently kill the bridge right after creating it.
    // Running them as three `join!` branches (rather than one sequential
    // chain) preserves the original design intent: daemon startup and
    // agent startup never block each other, and the server starts
    // accepting connections immediately rather than waiting on either —
    // routes that need a runtime already degrade gracefully (structured
    // "not ready" responses) until it's up.
    let (_daemon_bridge, _agent_stream, serve_result) = tokio::join!(
        run_daemon_and_bridge_events(Arc::clone(&daemon), domain_events_tx),
        run_agent_and_bridge_events(Arc::clone(&agent_runtime), agent_service, agent_events_tx),
        async {
            axum::serve(listener, router)
                .with_graceful_shutdown(async move {
                    shutdown_signal().await;
                    // Tell every open WebSocket connection to close
                    // cleanly before the process actually exits — see
                    // `desktop_bff::ws`'s module doc, "Keepalive and
                    // shutdown". `send` only errors if every receiver
                    // (i.e. every open connection) already dropped,
                    // which just means there was nothing to tell.
                    let _ = shutdown_tx.send(true);
                })
                .await
        }
    );

    serve_result.context("axum serve")
}

/// Starts the daemon runtime, then — once (and only if) that succeeds —
/// subscribes to its event firehose and bridges it onto `domain_events_tx`.
/// Returns `None` if either step failed (already logged); the caller keeps
/// the `Some` case alive for the process lifetime purely by holding this
/// future's output, not by storing it anywhere longer-lived.
async fn run_daemon_and_bridge_events(
    daemon: Arc<DaemonRuntime>,
    domain_events_tx: broadcast::Sender<desktop_daemon::events::DomainEvent>,
) -> Option<EventBridge> {
    if let Err(err) = daemon.start().await {
        tracing::error!(?err, "daemon runtime failed to start");
        return None;
    }
    match daemon.handle().await {
        Ok(handle) => Some(daemon_events::spawn(domain_events_tx, handle, 256)),
        Err(err) => {
            tracing::error!(?err, "daemon started but handle() unavailable; daemon-source domain events will not be bridged");
            None
        }
    }
}

/// Starts the agent runtime, then starts its `Ready`/`Status`/`Error` poll
/// regardless of whether startup itself succeeded — mirrors
/// `desktop-app/src-tauri/src/lib.rs`'s `start_event_streams`, which polls
/// unconditionally too (the poll loop's own `list_models` call surfaces a
/// still-starting-up runtime as an `Error` event rather than needing a
/// precondition here).
async fn run_agent_and_bridge_events(
    agent_runtime: Arc<AgentRuntime>,
    agent_service: Arc<AgentService>,
    agent_events_tx: broadcast::Sender<desktop_agent::types::AgentRuntimeEvent>,
) -> RuntimeEventStream {
    if let Err(err) = agent_runtime.start().await {
        tracing::error!(?err, "agent runtime failed to start");
    }
    agent_events::spawn(agent_service, move |event| {
        if let Err(err) = agent_events_tx.send(event) {
            tracing::debug!(?err, "agent_event publish dropped: channel closed or no subscribers yet");
        }
    })
}

/// Build a [`BffConfig`] from environment variables. All inputs are
/// optional *except* `SOMA_BFF_TOKEN` — we fall back to safe defaults
/// that match what `BffConfig::default()` produces for everything else.
/// We parse here (in `main`) rather than burying env reads inside
/// `BffConfig::default()` so the public `BffConfig` API stays pure data
/// and integration tests can pass it in by hand.
///
/// `SOMA_BFF_TOKEN` is mandatory and unconditional — not just "required
/// when binding to a non-loopback address". This server exists
/// specifically to be reached remotely (that's the whole point of this
/// crate per AGENTS.md's Desktop Host section); making the requirement
/// depend on the bind address would mean a config that's safe today
/// silently becomes unsafe the moment someone changes `SOMA_BFF_BIND`
/// from `127.0.0.1` to `0.0.0.0` without separately remembering to add a
/// token — the exact failure mode `somad bot --mode admin` has today
/// (fails open with no `--admin-token`). Failing closed unconditionally
/// means there is no configuration under which this process ever serves
/// a route without auth.
fn resolve_config() -> anyhow::Result<BffConfig> {
    let mut cfg = BffConfig::default();

    if let Ok(raw) = env::var("SOMA_BFF_BIND") {
        cfg.bind_addr = raw.parse::<SocketAddr>().with_context(|| {
            format!("SOMA_BFF_BIND must be a valid socket address (e.g. '127.0.0.1:4123'), got {raw:?}")
        })?;
    }

    cfg.auth_token = env::var("SOMA_BFF_TOKEN")
        .ok()
        .filter(|t| !t.is_empty())
        .context(
            "SOMA_BFF_TOKEN is required. desktop-bff is a remotely-reachable API server and refuses \
             to start without a bearer token configured — there is no insecure/loopback-only mode. \
             Generate one (e.g. `openssl rand -hex 32`) and set it in the environment.",
        )?;

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
