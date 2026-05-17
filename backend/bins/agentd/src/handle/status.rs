use crate::engine::ModelInfo as EngineModelInfo;

use super::{
    AgentHandle,
    types::{AgentStatus, ModelInfo},
};

impl AgentHandle {
    pub async fn status(&self) -> AgentStatus {
        let status = self.engine.status();
        AgentStatus {
            version: status.version,
            default_chat_model: status.default_chat_model,
            default_embed_model: status.default_embed_model,
            models: status.models.into_iter().map(to_model_info).collect(),
        }
    }

    pub async fn list_models(&self) -> Vec<ModelInfo> {
        self.engine
            .status()
            .models
            .into_iter()
            .map(to_model_info)
            .collect()
    }
}

fn to_model_info(m: EngineModelInfo) -> ModelInfo {
    ModelInfo {
        name: m.name,
        path: m.path,
        loaded: m.loaded,
        size_bytes: m.size_bytes,
    }
}
