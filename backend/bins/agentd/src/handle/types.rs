//! Plain-typed records returned from [`crate::AgentHandle`].

#[derive(Debug, Clone)]
pub struct ModelInfo {
    pub name: String,
    pub path: String,
    pub loaded: bool,
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct AgentStatus {
    pub version: String,
    pub default_chat_model: String,
    pub default_embed_model: String,
    pub models: Vec<ModelInfo>,
}

#[derive(Debug, Clone)]
pub struct RerankCandidate {
    pub id: String,
    pub text: String,
}

#[derive(Debug, Clone)]
pub struct RerankRequest {
    pub query: String,
    pub candidates: Vec<RerankCandidate>,
    pub top_n: i32,
}

#[derive(Debug, Clone)]
pub struct RerankHit {
    pub id: String,
    pub score: f32,
}

#[derive(Debug, Clone)]
pub struct RerankResult {
    pub hits: Vec<RerankHit>,
}
