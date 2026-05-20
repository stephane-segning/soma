//! Binary-side glue: lift the agent config out of `tauri-plugin-store` and
//! normalize it through `desktop_agent::config`. Kept here (not in
//! `desktop-services`) because it is the binary's job to know which
//! settings live in which crate.

use async_trait::async_trait;
use desktop_agent::config::{AGENT_CONFIG_SETTINGS_KEY, AgentRuntimeConfig, normalize_runtime_config};
use desktop_agent::service::ConfigSource;
use desktop_services::app_store::AppStore;
use serde_json::Value;
use tauri::{AppHandle, Runtime};

pub struct StoreBackedConfigSource<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> StoreBackedConfigSource<R> {
    pub fn new(app: AppHandle<R>) -> Self {
        Self { app }
    }
}

#[async_trait]
impl<R: Runtime> ConfigSource for StoreBackedConfigSource<R> {
    async fn read(&self) -> AgentRuntimeConfig {
        // `tauri-plugin-store` is synchronous; we just take the snapshot.
        let Ok(store) = AppStore::open(&self.app) else {
            return AgentRuntimeConfig::default();
        };
        let raw = store.setting(AGENT_CONFIG_SETTINGS_KEY).unwrap_or(Value::Null);
        normalize_runtime_config(&raw)
    }
}
