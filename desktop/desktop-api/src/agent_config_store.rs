//! Bridges `desktop_agent::service::AgentConfigStore` (the read seam
//! `DbConfigSource` needs) onto `desktop_daemon`'s `DaemonRuntime` /
//! `soma_daemon::DaemonHandle` — the DB pool, migrations, and
//! repositories all live behind the daemon (AGENTS.md: "one SQLite
//! database shared by both runtimes"). Lives here, not in `desktop-agent`
//! or `desktop-daemon`, because this is the one crate that already
//! depends on both and neither of those two should have to depend on
//! the other just for this.
//!
//! Both `desktop-app/src-tauri` and `desktop-bff` construct one of these
//! at startup and hand it to `desktop_agent::service::DbConfigSource`.

use std::sync::Arc;

use async_trait::async_trait;
use desktop_agent::config::AgentConfigOverrides;
use desktop_agent::service::AgentConfigStore;
use desktop_daemon::runtime::DaemonRuntime;

use crate::agent_config::provider_from_wire;

/// Adapts the in-process daemon handle to [`AgentConfigStore`]. Every
/// call re-fetches from the daemon — no caching here — because
/// `AgentService` itself re-resolves config on every request (see
/// `DbConfigSource`'s doc comment); caching at this layer would silently
/// reintroduce the staleness that design deliberately avoids.
pub struct DaemonBackedAgentConfigStore {
    daemon: Arc<DaemonRuntime>,
}

impl DaemonBackedAgentConfigStore {
    pub fn new(daemon: Arc<DaemonRuntime>) -> Self {
        Self { daemon }
    }
}

#[async_trait]
impl AgentConfigStore for DaemonBackedAgentConfigStore {
    async fn default_overrides(&self) -> AgentConfigOverrides {
        let Ok(handle) = self.daemon.handle().await else {
            // The daemon hasn't finished starting yet — a real window at
            // boot, since the agent runtime's own event poll can fire
            // before `DaemonRuntime::start` completes (they're started
            // concurrently; see `desktop-app/src-tauri/src/lib.rs`'s
            // `setup`). Degrade to "no overrides" rather than failing
            // the caller: `AgentRuntimeConfig::default()` covers the gap
            // identically to a fresh install with an empty default row.
            tracing::debug!("agent config: daemon handle not ready yet; using compiled-in defaults");
            return AgentConfigOverrides::default();
        };
        match handle.agent_config_get_default().await {
            Ok(record) => from_record(record),
            Err(err) => {
                tracing::warn!(%err, "agent config: default-scope read failed; using compiled-in defaults");
                AgentConfigOverrides::default()
            }
        }
    }

    async fn space_overrides(&self, space_id: &str) -> AgentConfigOverrides {
        let Ok(handle) = self.daemon.handle().await else {
            tracing::debug!(space_id, "agent config: daemon handle not ready yet; using compiled-in defaults");
            return AgentConfigOverrides::default();
        };
        match handle.agent_config_get_space(space_id).await {
            Ok(record) => from_record(record),
            Err(err) => {
                tracing::warn!(%err, space_id, "agent config: space-scope read failed; inheriting the default scope only");
                AgentConfigOverrides::default()
            }
        }
    }
}

fn from_record(r: soma_daemon::handle_types::AgentProviderConfigRecord) -> AgentConfigOverrides {
    AgentConfigOverrides {
        provider: r.provider.as_deref().and_then(provider_from_wire),
        base_url: r.base_url,
        api_key: r.api_key,
        chat_model: r.chat_model,
        embed_model: r.embed_model,
        request_timeout_ms: r.request_timeout_ms.map(|v| v.max(0) as u64),
        poll_interval_ms: r.poll_interval_ms.map(|v| v.max(0) as u64),
    }
}
