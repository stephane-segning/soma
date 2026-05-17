//! Embeddable runtime for the Soma desktop agent (`soma-agentd`).
//!
//! Normally invoked via the `soma-agentd` binary, which is a thin clap shim
//! around [`run`]. This library is also intended to be embedded into other
//! Rust processes (e.g. a napi-rs addon hosting the desktop's Rust services
//! in-process) so the binary's gRPC-over-Unix-socket surface can be skipped.

use std::path::PathBuf;

use anyhow::Context;
use soma_core::SomaResult;
use soma_proto_build::agent;
use soma_socket::serve_grpc_unix;
use tokio::{
    sync::oneshot,
    task::JoinHandle,
};
use tonic::transport::Server;
use tracing::info;

mod config;
mod engine;
mod grpc;
mod tasks;

use engine::EngineHandle;
use grpc::AgentdService;
use tasks::BackgroundTaskStore;

#[doc(hidden)]
pub mod __bin {
    pub use crate::config::Args;
}

/// Configuration for the embeddable `soma-agentd` runtime.
///
/// The binary shim builds one from clap; embedders construct one directly.
/// Plain types only — no clap derives.
#[derive(Debug, Clone)]
pub struct RuntimeConfig {
    /// Optional Unix socket path for desktop IPC. `None` means no gRPC
    /// listener is started — suitable for in-process embedders.
    pub socket_path: Option<PathBuf>,
    /// SQLite path for persisted background tasks.
    pub db_path: PathBuf,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            socket_path: None,
            db_path: PathBuf::from("./agentd.db"),
        }
    }
}

/// Handle to a running agent. Dropping without calling [`shutdown`] is
/// allowed but will leave the gRPC server (if any) running until ctrl-c is
/// observed in the embedder's main loop.
///
/// [`shutdown`]: RuntimeHandle::shutdown
pub struct RuntimeHandle {
    grpc_shutdown: Option<oneshot::Sender<()>>,
    supervisor: JoinHandle<SomaResult<()>>,
    socket_path: Option<PathBuf>,
}

impl RuntimeHandle {
    /// Gracefully shut the runtime down: signal the gRPC server (if any) and
    /// await the supervisor task.
    pub async fn shutdown(mut self) -> SomaResult<()> {
        if let Some(tx) = self.grpc_shutdown.take() {
            let _ = tx.send(());
        }
        let result = match self.supervisor.await {
            Ok(res) => res,
            Err(err) if err.is_cancelled() => Ok(()),
            Err(err) => Err(soma_core::Error::Anyhow(err.into())),
        };

        if let Some(path) = self.socket_path.as_ref()
            && path.exists()
        {
            let _ = std::fs::remove_file(path);
        }

        result
    }

    /// Wait for the supervisor task to exit on its own (e.g. gRPC server
    /// failure) without explicitly signalling shutdown.
    pub async fn wait(self) -> SomaResult<()> {
        match self.supervisor.await {
            Ok(res) => res,
            Err(err) if err.is_cancelled() => Ok(()),
            Err(err) => Err(soma_core::Error::Anyhow(err.into())),
        }
    }
}

/// Start the agent runtime in the background.
///
/// The caller must drive a Tokio runtime; this function does not spawn one.
/// Tracing, signal handling, and global allocator configuration are the
/// embedder's responsibility.
pub async fn run(config: RuntimeConfig) -> SomaResult<RuntimeHandle> {
    let engine = EngineHandle::spawn(&config);
    let task_store = BackgroundTaskStore::connect(&config.db_path)
        .await
        .context("connect background task store")
        .map_err(soma_core::Error::Anyhow)?;

    info!(
        socket = ?config.socket_path,
        db_path = %config.db_path.display(),
        "soma-agentd starting"
    );

    let (supervisor, grpc_shutdown, socket_path) = match config.socket_path.clone() {
        Some(path) => {
            let svc = agent::agent_server::AgentServer::new(AgentdService::new(engine, task_store));
            let (tx, rx) = oneshot::channel::<()>();
            let router = Server::builder().add_service(svc);
            let path_for_task = path.clone();
            let supervisor: JoinHandle<SomaResult<()>> = tokio::spawn(async move {
                serve_grpc_unix(path_for_task, router, async move {
                    let _ = rx.await;
                })
                .await
            });
            (supervisor, Some(tx), Some(path))
        }
        None => {
            // No socket path: don't start a gRPC listener. Build the service
            // anyway so the embedder can reach the underlying engine/store via
            // a future in-process surface; for now we just keep it alive on a
            // pending supervisor task.
            let service = AgentdService::new(engine, task_store);
            let supervisor: JoinHandle<SomaResult<()>> = tokio::spawn(async move {
                let _service = service;
                std::future::pending::<SomaResult<()>>().await
            });
            (supervisor, None, None)
        }
    };

    Ok(RuntimeHandle {
        grpc_shutdown,
        supervisor,
        socket_path,
    })
}
