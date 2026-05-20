//! Runtime configuration + workspace-scoped resolution. Mirrors
//! `desktop/soma/src/main/services/agent-config.ts`.
//!
//! Two-tier model: a single `AgentRuntimeConfig` (process-wide defaults +
//! per-workspace overrides) collapses to a `ResolvedWorkspaceAgentConfig`
//! once a caller asks for a specific space. Resolution stays pure so the
//! agent service can rebuild it per-call without a cache.

mod normalize;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub use normalize::normalize_runtime_config;

use crate::types::AgentProvider;

pub const AGENT_CONFIG_SETTINGS_KEY: &str = "agent.config";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AgentModelCapabilities {
    pub chat: Option<bool>,
    pub embed: Option<bool>,
    pub tool: Option<bool>,
    pub image: Option<bool>,
    pub updated_at_ms: Option<i64>,
}

impl AgentModelCapabilities {
    pub fn is_empty(&self) -> bool {
        self.chat.is_none()
            && self.embed.is_none()
            && self.tool.is_none()
            && self.image.is_none()
            && self.updated_at_ms.is_none()
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AgentWorkspaceRuntimeConfig {
    pub chat_model: Option<String>,
    pub embed_model: Option<String>,
    pub model_capabilities: HashMap<String, AgentModelCapabilities>,
}

impl AgentWorkspaceRuntimeConfig {
    pub fn is_empty(&self) -> bool {
        self.chat_model.as_deref().map_or(true, str::is_empty)
            && self.embed_model.as_deref().map_or(true, str::is_empty)
            && self.model_capabilities.is_empty()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuntimeConfig {
    pub provider: AgentProvider,
    pub open_ai_base_url: String,
    #[serde(default)]
    pub open_ai_api_key: String,
    pub open_ai_chat_model: String,
    pub open_ai_embed_model: String,
    pub poll_interval_ms: u64,
    pub request_timeout_ms: u64,
    #[serde(default)]
    pub model_capabilities: HashMap<String, AgentModelCapabilities>,
    #[serde(default)]
    pub workspaces: HashMap<String, AgentWorkspaceRuntimeConfig>,
}

impl Default for AgentRuntimeConfig {
    fn default() -> Self {
        Self {
            provider: AgentProvider::OpenAiCompatible,
            open_ai_base_url: "http://127.0.0.1:11434/v1".into(),
            open_ai_api_key: String::new(),
            open_ai_chat_model: "llama3.2:1b".into(),
            open_ai_embed_model: "nomic-embed-text".into(),
            poll_interval_ms: 5_000,
            request_timeout_ms: 30_000,
            model_capabilities: HashMap::new(),
            workspaces: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ResolvedWorkspaceAgentConfig {
    pub provider: AgentProvider,
    pub open_ai_base_url: String,
    pub open_ai_api_key: String,
    pub poll_interval_ms: u64,
    pub request_timeout_ms: u64,
    pub chat_model: String,
    pub embed_model: String,
    pub model_capabilities: HashMap<String, AgentModelCapabilities>,
}

/// Collapse process-wide defaults + an optional per-workspace override into
/// the flat config the provider HTTP layer consumes.
pub fn resolve_workspace(config: &AgentRuntimeConfig, space_id: Option<&str>) -> ResolvedWorkspaceAgentConfig {
    let workspace = space_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .and_then(|id| config.workspaces.get(id));

    let chat_model = workspace
        .and_then(|w| non_empty(&w.chat_model))
        .unwrap_or_else(|| config.open_ai_chat_model.clone());
    let embed_model = workspace
        .and_then(|w| non_empty(&w.embed_model))
        .unwrap_or_else(|| config.open_ai_embed_model.clone());

    // Workspace overrides win on a per-model basis; everything else merges
    // in from the process-wide capabilities map.
    let mut capabilities = config.model_capabilities.clone();
    if let Some(w) = workspace {
        for (model, caps) in &w.model_capabilities {
            capabilities.insert(model.clone(), caps.clone());
        }
    }

    ResolvedWorkspaceAgentConfig {
        provider: config.provider,
        open_ai_base_url: config.open_ai_base_url.clone(),
        open_ai_api_key: config.open_ai_api_key.clone(),
        poll_interval_ms: config.poll_interval_ms,
        request_timeout_ms: config.request_timeout_ms,
        chat_model,
        embed_model,
        model_capabilities: capabilities,
    }
}

fn non_empty(value: &Option<String>) -> Option<String> {
    value.as_ref().map(|s| s.trim()).filter(|s| !s.is_empty()).map(str::to_owned)
}
