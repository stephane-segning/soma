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

use std::path::{Path, PathBuf};

use desktop_core::error::{DesktopError, DesktopResult};
use soma_daemon::{DaemonHandle, RuntimeConfig, RuntimeHandle, run};
use tokio::sync::Mutex;

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
            listen_addrs: vec!["/ip4/0.0.0.0/tcp/0/ws".to_string()],
            enable_mdns: true,
        }
    }
}

pub struct DaemonRuntime {
    inner: Mutex<Option<RuntimeHandle>>,
    opts: DaemonRuntimeOptions,
}

impl DaemonRuntime {
    pub fn new(opts: DaemonRuntimeOptions) -> Self {
        Self {
            inner: Mutex::new(None),
            opts,
        }
    }

    pub async fn start(&self) -> DesktopResult<()> {
        let mut guard = self.inner.lock().await;
        if guard.is_some() {
            return Ok(());
        }
        let config = self.build_config().await?;
        tracing::info!(
            daemon_db_path = %config.db_path.display(),
            blob_dir = %config.blob_dir.display(),
            "starting in-process soma-daemon"
        );
        let handle = run(config)
            .await
            .map_err(|e| DesktopError::Daemon { message: e.to_string() })?;
        *guard = Some(handle);
        Ok(())
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
    /// completed yet.
    pub async fn handle(&self) -> DesktopResult<DaemonHandle> {
        let guard = self.inner.lock().await;
        Ok(guard
            .as_ref()
            .ok_or_else(|| DesktopError::Daemon {
                message: "daemon runtime not started".into(),
            })?
            .handle())
    }

    async fn build_config(&self) -> DesktopResult<RuntimeConfig> {
        let data_dir = self.opts.user_data_dir.join("daemon");
        let blob_dir = data_dir.join("blobs");
        tokio::fs::create_dir_all(&blob_dir).await?;
        let mut config = RuntimeConfig::default();
        config.db_path = data_dir.join("daemon.db");
        config.blob_dir = blob_dir;
        config.identity_path = data_dir.join("identity.key");
        config.enable_mdns = self.opts.enable_mdns;
        config.listen_addrs = parse_multiaddrs(&self.opts.listen_addrs)?;
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
