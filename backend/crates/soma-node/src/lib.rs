//! napi-rs addon embedding the Soma daemon + agent runtimes for Electron main.
//!
//! Loaded by the desktop Electron app's main process; this is the only Rust↔Node
//! boundary in the system. Async-only API. Build with `--profile addon-release`
//! so panics at the boundary unwind into typed JS errors instead of aborting
//! Electron's main process.
//!
//! P3a scope: the addon can start both runtimes, hold them alive, and shut them
//! down. Method-by-method daemon/agent surfaces (upload_blob, read_blob, chat,
//! etc.) come in P3b after the runtime libs are extended to expose their
//! services for in-process calls.

use std::path::PathBuf;
use std::str::FromStr;

use napi::Error as NapiError;
use napi::Status;
use napi_derive::napi;
use tokio::sync::Mutex;

use soma_agentd::{RuntimeConfig as AgentdConfig, RuntimeHandle as AgentdHandle};
use soma_daemon::{
    DaemonHandle as DaemonInProcessHandle, RuntimeConfig as DaemonConfig,
    RuntimeHandle as DaemonHandle,
};

#[napi(object)]
pub struct DaemonStatusJs {
    pub peer_id: String,
    pub listen_addrs: Vec<String>,
}

#[napi(object)]
pub struct StartConfig {
    pub daemon_db_path: String,
    pub agentd_db_path: String,
    pub blob_dir: String,
    pub identity_path: Option<String>,
    pub listen_addrs: Option<Vec<String>>,
    pub bootstrap_addrs: Option<Vec<String>>,
    pub rendezvous_addrs: Option<Vec<String>>,
    pub relay_addrs: Option<Vec<String>>,
    pub enable_mdns: Option<bool>,
}

struct RuntimeBundle {
    daemon: DaemonHandle,
    agentd: AgentdHandle,
}

#[napi]
pub struct SomaHandle {
    inner: Mutex<Option<RuntimeBundle>>,
}

#[napi]
impl SomaHandle {
    /// Gracefully shut down both embedded runtimes. Idempotent: calling
    /// `shutdown` twice is safe; the second call is a no-op.
    #[napi]
    pub async fn shutdown(&self) -> napi::Result<()> {
        let Some(bundle) = self.inner.lock().await.take() else {
            return Ok(());
        };

        // Shut both down concurrently. Log every failure before returning so
        // operators see all errors, then surface the first one to JS.
        let (daemon_res, agentd_res) =
            tokio::join!(bundle.daemon.shutdown(), bundle.agentd.shutdown());

        if let Err(err) = &daemon_res {
            tracing::error!(error = %err, "daemon shutdown failed");
        }
        if let Err(err) = &agentd_res {
            tracing::error!(error = %err, "agentd shutdown failed");
        }

        daemon_res.map_err(to_napi)?;
        agentd_res.map_err(to_napi)?;
        Ok(())
    }

    /// Whether the runtimes are still alive (i.e. `shutdown` has not been
    /// called and consumed them).
    #[napi]
    pub async fn is_running(&self) -> bool {
        self.inner.lock().await.is_some()
    }

    /// Current daemon peer id + listen addresses. Errors if the runtime has
    /// already been shut down.
    #[napi]
    pub async fn status(&self) -> napi::Result<DaemonStatusJs> {
        let handle = self.daemon_handle().await?;
        let status = handle.status().await;
        Ok(DaemonStatusJs {
            peer_id: status.peer_id,
            listen_addrs: status.listen_addrs,
        })
    }
}

impl SomaHandle {
    /// Get a cloned in-process handle to the daemon, releasing the inner
    /// lock immediately so concurrent napi calls can proceed.
    async fn daemon_handle(&self) -> napi::Result<DaemonInProcessHandle> {
        let guard = self.inner.lock().await;
        let bundle = guard.as_ref().ok_or_else(|| {
            NapiError::new(Status::GenericFailure, "soma runtime is not running")
        })?;
        Ok(bundle.daemon.handle())
    }
}

/// Start the Soma embedded runtimes (peer + agent) and return a handle that
/// keeps them alive. Both run in the napi-rs tokio runtime owned by this
/// addon; the caller does not provide one.
#[napi]
pub async fn start(config: StartConfig) -> napi::Result<SomaHandle> {
    let daemon_config = build_daemon_config(&config)?;
    let agentd_config = build_agentd_config(&config);

    let daemon = soma_daemon::run(daemon_config).await.map_err(to_napi)?;

    let agentd = match soma_agentd::run(agentd_config).await {
        Ok(h) => h,
        Err(err) => {
            // Daemon is already up; tear it down before propagating.
            if let Err(shutdown_err) = daemon.shutdown().await {
                tracing::error!(error = %shutdown_err, "rolling back daemon after agentd start failure");
            }
            return Err(to_napi(err));
        }
    };

    Ok(SomaHandle {
        inner: Mutex::new(Some(RuntimeBundle { daemon, agentd })),
    })
}

fn build_daemon_config(config: &StartConfig) -> napi::Result<DaemonConfig> {
    let mut daemon_config = DaemonConfig::default();
    daemon_config.socket_path = None;
    daemon_config.db_path = PathBuf::from(&config.daemon_db_path);
    daemon_config.blob_dir = PathBuf::from(&config.blob_dir);
    if let Some(path) = config.identity_path.as_ref() {
        daemon_config.identity_path = PathBuf::from(path);
    }
    if let Some(addrs) = config.listen_addrs.as_ref() {
        daemon_config.listen_addrs = parse_multiaddrs(addrs, "listen_addrs")?;
    }
    if let Some(addrs) = config.bootstrap_addrs.as_ref() {
        daemon_config.bootstrap_addrs = parse_multiaddrs(addrs, "bootstrap_addrs")?;
    }
    if let Some(addrs) = config.rendezvous_addrs.as_ref() {
        daemon_config.rendezvous_addrs = parse_multiaddrs(addrs, "rendezvous_addrs")?;
    }
    if let Some(addrs) = config.relay_addrs.as_ref() {
        daemon_config.relay_addrs = parse_multiaddrs(addrs, "relay_addrs")?;
    }
    if let Some(enable) = config.enable_mdns {
        daemon_config.enable_mdns = enable;
    }
    Ok(daemon_config)
}

fn build_agentd_config(config: &StartConfig) -> AgentdConfig {
    AgentdConfig {
        socket_path: None,
        db_path: PathBuf::from(&config.agentd_db_path),
    }
}

fn parse_multiaddrs(addrs: &[String], field: &str) -> napi::Result<Vec<libp2p::Multiaddr>> {
    addrs
        .iter()
        .enumerate()
        .map(|(idx, s)| {
            libp2p::Multiaddr::from_str(s).map_err(|err| {
                NapiError::new(
                    Status::InvalidArg,
                    format!("invalid multiaddr at {field}[{idx}] ({s:?}): {err}"),
                )
            })
        })
        .collect()
}

fn to_napi<E: std::fmt::Display>(err: E) -> NapiError {
    NapiError::new(Status::GenericFailure, err.to_string())
}
