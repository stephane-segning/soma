//! Owns the in-process `soma_agentd::RuntimeHandle`. Lifecycle parity with
//! the agent half of `desktop/soma/src/main/services/addon-runtime.ts`.

use desktop_core::error::{DesktopError, DesktopResult};
use soma_agentd::{AgentHandle, RuntimeConfig, RuntimeHandle, run};
use tokio::sync::Mutex;

pub struct AgentRuntime {
    inner: Mutex<Option<RuntimeHandle>>,
}

impl AgentRuntime {
    pub fn new() -> Self {
        Self { inner: Mutex::new(None) }
    }

    pub async fn start(&self) -> DesktopResult<()> {
        let mut guard = self.inner.lock().await;
        if guard.is_some() {
            return Ok(());
        }
        tracing::info!("starting in-process soma-agentd");
        let handle = run(RuntimeConfig::default())
            .await
            .map_err(|e| DesktopError::Agent { message: e.to_string() })?;
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
            .map_err(|e| DesktopError::Agent { message: e.to_string() })
    }

    pub async fn handle(&self) -> DesktopResult<AgentHandle> {
        let guard = self.inner.lock().await;
        Ok(guard
            .as_ref()
            .ok_or_else(|| DesktopError::Agent {
                message: "agent runtime not started".into(),
            })?
            .handle())
    }
}

impl Default for AgentRuntime {
    fn default() -> Self {
        Self::new()
    }
}
