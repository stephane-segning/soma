//! Embeddable runtime for the Soma desktop agent.
//!
//! There is no standalone `soma-agentd` binary anymore; the agent ships only
//! as a library, embedded in-process by the Tauri desktop app via the
//! `desktop-agent` crate.

use soma_core::SomaResult;
use tokio::{sync::oneshot, task::JoinHandle};
use tracing::info;

mod engine;
mod handle;

pub use handle::{AgentHandle, types as handle_types};

use engine::EngineHandle;

/// Configuration for the embeddable `soma-agentd` runtime.
///
/// Currently empty — the agent runtime has no persistent state of its own.
/// Kept as a struct (rather than a unit) so future fields can be added without
/// changing the public signature of [`run`].
#[derive(Debug, Clone, Default)]
pub struct RuntimeConfig {}

/// Handle to a running agent. Dropping without calling [`shutdown`] is allowed
/// but will leave the supervisor running until the embedder's Tokio runtime
/// teardown drops it.
///
/// [`shutdown`]: RuntimeHandle::shutdown
pub struct RuntimeHandle {
    shutdown: Option<oneshot::Sender<()>>,
    supervisor: JoinHandle<SomaResult<()>>,
    /// Clone of the engine so in-process callers (the napi addon, tests) can
    /// obtain an [`AgentHandle`].
    agent: AgentHandle,
}

impl RuntimeHandle {
    /// Cloneable in-process accessor for agent operations.
    pub fn handle(&self) -> AgentHandle {
        self.agent.clone()
    }

    /// Gracefully shut the runtime down. Idempotent on the channel side.
    pub async fn shutdown(mut self) -> SomaResult<()> {
        if let Some(tx) = self.shutdown.take() {
            let _ = tx.send(());
        }
        match self.supervisor.await {
            Ok(res) => res,
            Err(err) if err.is_cancelled() => Ok(()),
            Err(err) => Err(soma_core::Error::Anyhow(err.into())),
        }
    }

    /// Wait for the supervisor task to exit on its own without signalling
    /// shutdown.
    pub async fn wait(&mut self) -> SomaResult<()> {
        match (&mut self.supervisor).await {
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
pub async fn run(_config: RuntimeConfig) -> SomaResult<RuntimeHandle> {
    let engine = EngineHandle::spawn();

    info!("soma-agentd starting");

    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let agent = AgentHandle::new(engine.clone());

    // Keep the engine clone alive for the supervisor's lifetime so background
    // work continues until shutdown is signalled. The embedder reaches the
    // engine through the AgentHandle exposed on RuntimeHandle.
    let supervisor: JoinHandle<SomaResult<()>> = tokio::spawn(async move {
        let _engine = engine;
        let _ = shutdown_rx.await;
        Ok(())
    });

    Ok(RuntimeHandle {
        shutdown: Some(shutdown_tx),
        supervisor,
        agent,
    })
}
