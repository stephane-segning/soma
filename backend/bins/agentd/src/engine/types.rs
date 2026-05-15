use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct ModelInfo {
    pub name: String,
    pub path: String,
    pub loaded: bool,
    pub kind: ModelKind,
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModelKind {
    Chat,
    Embed,
    Unknown,
}

#[derive(Debug, Clone)]
pub struct EngineStatus {
    pub version: String,
    pub default_chat_model: String,
    pub default_embed_model: String,
    pub models: Vec<ModelInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct ChatRequest {
    pub model: Option<String>,
    pub messages: Vec<ChatMessage>,
    pub temperature: f32,
    pub max_tokens: u64,
}

#[derive(Debug, Clone)]
pub struct EmbedRequest {
    pub model: Option<String>,
    pub input: Vec<String>,
}

#[derive(Debug, Clone)]
pub enum EngineChatStreamEvent {
    Token(String),
    Done(String),
}
