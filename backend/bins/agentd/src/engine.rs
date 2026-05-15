use tracing::info;

use crate::config::AgentdConfig;

#[derive(Debug, Clone)]
pub struct ModelInfo {
    pub name: String,
    pub path: String,
    pub loaded: bool,
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct EngineStatus {
    pub version: String,
    pub default_chat_model: String,
    pub default_embed_model: String,
    pub models: Vec<ModelInfo>,
}

#[derive(Clone, Debug)]
pub struct EngineHandle;

impl EngineHandle {
    pub fn spawn(_config: AgentdConfig) -> Self {
        info!("soma-agentd local helper engine ready; model provider RPCs are disabled");
        Self
    }

    pub fn status(&self) -> EngineStatus {
        EngineStatus {
            version: env!("CARGO_PKG_VERSION").to_string(),
            default_chat_model: String::new(),
            default_embed_model: String::new(),
            models: Vec::new(),
        }
    }
}
