//! Owns the in-process `soma_daemon::RuntimeHandle`. Mirrors the daemon
//! half of `desktop/soma/src/main/services/addon-runtime.ts`: builds the
//! `RuntimeConfig` from the desktop's userData layout, spawns the daemon
//! via `soma_daemon::run`, and exposes an idempotent `start`/`shutdown`
//! pair.
//!
//! Note: `soma_daemon::RuntimeHandle` is not `Clone` and consumes `self`
//! on `shutdown`, so we keep it inside a `Mutex<Option<…>>`. The cloneable
//! `DaemonHandle` (obtained via `RuntimeHandle::handle()`) is what callers
//! actually use to invoke daemon operations.
//!
//! `start` holds `inner`'s lock for its entire body (config build through
//! `run()` returning), by design — it must not race a concurrent `start`.
//! The cost of that design is that a regression making `soma_daemon::run`
//! hang instead of returning `Err` wedges this lock *forever*: every
//! future `handle()` call — from every command handler, plus the agent
//! config poll (`desktop_api::agent_config_store`) — blocks indefinitely
//! instead of failing, so the renderer sees "nothing happens" rather than
//! an error (see AGENTS.md "Crash isolation & supervision": a stuck
//! `daemon.start()` must be detectable, not silent). `STARTUP_TIMEOUT`
//! bounds `run()` so `start()` always eventually returns and releases the
//! lock either way, turning a permanent hang into a loud, typed error.

use std::path::{Path, PathBuf};
use std::time::Duration;

use desktop_core::error::{DesktopError, DesktopResult};
use soma_daemon::{DaemonHandle, RuntimeConfig, RuntimeHandle, run};
use tokio::sync::Mutex;

/// Generous ceiling for `soma_daemon::run` to finish a cold start (SQLite
/// connect + migrate, identity load/generate, libp2p swarm construction +
/// listen). Sized for a slow device/simulator, not the common case —
/// startup normally completes in well under a second.
const STARTUP_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Clone)]
pub struct DaemonRuntimeOptions {
    pub user_data_dir: PathBuf,
    pub listen_addrs: Vec<String>,
    pub enable_mdns: bool,
}

impl DaemonRuntimeOptions {
    pub fn new(user_data_dir: impl AsRef<Path>) -> Self {
        Self {
            user_data_dir: user_data_dir.as_ref().to_path_buf(),
            listen_addrs: vec![default_listen_addr().to_string()],
            enable_mdns: true,
        }
    }
}

/// `soma_peer::transport::build_peer_swarm` drops websocket transport
/// support on Android (no `/etc/resolv.conf` for libp2p's internal
/// websocket DNS resolver — see that function's doc comment), so a `/ws`
/// listen address there would build the peer successfully and then fail
/// every single `listen_on` call (logged, not fatal, but the peer would
/// never accept an inbound connection). Plain `tcp` listens fine on every
/// target, Android included.
#[cfg(not(target_os = "android"))]
const fn default_listen_addr() -> &'static str {
    "/ip4/0.0.0.0/tcp/0/ws"
}

#[cfg(target_os = "android")]
const fn default_listen_addr() -> &'static str {
    "/ip4/0.0.0.0/tcp/0"
}

pub struct DaemonRuntime {
    inner: Mutex<Option<RuntimeHandle>>,
    /// Diagnostic-only: the message from the most recently *failed*
    /// `start()` (an `Err` from `run()`, or a `STARTUP_TIMEOUT` timeout),
    /// so `handle()`'s "not started" error says *why*, not just *that*.
    /// Never consulted for correctness — `inner` alone decides readiness.
    last_error: Mutex<Option<String>>,
    opts: DaemonRuntimeOptions,
}

impl DaemonRuntime {
    pub fn new(opts: DaemonRuntimeOptions) -> Self {
        Self {
            inner: Mutex::new(None),
            last_error: Mutex::new(None),
            opts,
        }
    }

    pub async fn start(&self) -> DesktopResult<()> {
        tracing::info!("daemon_runtime.start: entered, acquiring runtime lock");
        let mut guard = self.inner.lock().await;
        if guard.is_some() {
            tracing::debug!("daemon_runtime.start: already started, no-op");
            return Ok(());
        }

        tracing::info!("daemon_runtime.start: building runtime config");
        let config = match self.build_config().await {
            Ok(config) => config,
            Err(err) => return Err(self.fail_start(format!("building runtime config: {err}")).await),
        };
        tracing::info!(
            daemon_db_path = %config.db_path.display(),
            blob_dir = %config.blob_dir.display(),
            enable_mdns = config.enable_mdns,
            "daemon_runtime.start: calling soma_daemon::run (bounded to {}s)",
            STARTUP_TIMEOUT.as_secs()
        );

        let handle = match tokio::time::timeout(STARTUP_TIMEOUT, run(config)).await {
            Ok(Ok(handle)) => handle,
            Ok(Err(err)) => return Err(self.fail_start(err.to_string()).await),
            Err(_elapsed) => {
                return Err(self
                    .fail_start(format!(
                        "soma_daemon::run did not return within {}s (timed out) — it is hanging, not erroring; \
                         check the last `daemon_runtime.*`/`soma_daemon::run` step logged before this line",
                        STARTUP_TIMEOUT.as_secs()
                    ))
                    .await);
            }
        };

        tracing::info!("daemon_runtime.start: soma_daemon::run returned Ok, runtime is ready");
        *guard = Some(handle);
        *self.last_error.lock().await = None;
        Ok(())
    }

    /// Records the failure for `handle()`'s benefit, logs it loudly (this
    /// is the one place a stuck-forever `start()` used to produce zero
    /// output), and returns the typed error for the caller to propagate.
    async fn fail_start(&self, message: String) -> DesktopError {
        tracing::error!(%message, "daemon_runtime.start: failed");
        *self.last_error.lock().await = Some(message.clone());
        DesktopError::Daemon { message }
    }

    pub async fn shutdown(&self) -> DesktopResult<()> {
        let Some(handle) = self.inner.lock().await.take() else {
            return Ok(());
        };
        handle
            .shutdown()
            .await
            .map_err(|e| DesktopError::Daemon { message: e.to_string() })
    }

    /// Cloneable accessor for daemon operations. Errors if `start` hasn't
    /// completed yet — still starting, never called, or failed/timed out
    /// (in which case the message includes the last failure reason).
    pub async fn handle(&self) -> DesktopResult<DaemonHandle> {
        let guard = self.inner.lock().await;
        if let Some(handle) = guard.as_ref() {
            return Ok(handle.handle());
        }
        drop(guard);
        let message = match self.last_error.lock().await.clone() {
            Some(reason) => format!("daemon runtime not started: {reason}"),
            None => "daemon runtime not started".to_string(),
        };
        Err(DesktopError::Daemon { message })
    }

    async fn build_config(&self) -> DesktopResult<RuntimeConfig> {
        let data_dir = self.opts.user_data_dir.join("daemon");
        let blob_dir = data_dir.join("blobs");
        tokio::fs::create_dir_all(&blob_dir).await?;
        let config = RuntimeConfig {
            db_path: data_dir.join("daemon.db"),
            blob_dir,
            identity_path: data_dir.join("identity.key"),
            enable_mdns: self.opts.enable_mdns,
            listen_addrs: parse_multiaddrs(&self.opts.listen_addrs)?,
            ..RuntimeConfig::default()
        };
        Ok(config)
    }
}

fn parse_multiaddrs(addrs: &[String]) -> DesktopResult<Vec<libp2p::Multiaddr>> {
    use std::str::FromStr;
    addrs
        .iter()
        .map(|s| {
            libp2p::Multiaddr::from_str(s)
                .map_err(|e| DesktopError::invalid(format!("invalid multiaddr {s:?}: {e}")))
        })
        .collect()
}
