use tracing::info;

use crate::config::AgentdConfig;

use super::types::EngineStatus;

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
