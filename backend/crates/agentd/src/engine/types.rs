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
