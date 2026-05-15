use serde::{Deserialize, Serialize};

use super::types::ChatMessage;

#[derive(Debug, Deserialize)]
pub(super) struct ListModelsResponse {
    #[serde(default)]
    pub data: Vec<ModelEntry>,
}

#[derive(Debug, Deserialize)]
pub(super) struct ModelEntry {
    #[serde(default)]
    pub id: String,
}

#[derive(Debug, Serialize)]
pub(super) struct ChatCompletionRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub temperature: f32,
    #[serde(rename = "max_tokens")]
    pub max_tokens: u64,
    pub stream: bool,
}

#[derive(Debug, Deserialize)]
pub(super) struct ChatCompletionResponse {
    #[serde(default)]
    pub choices: Vec<ChatCompletionChoice>,
}

#[derive(Debug, Deserialize)]
pub(super) struct ChatCompletionChoice {
    pub message: Option<ChatCompletionMessage>,
    pub text: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct ChatCompletionMessage {
    pub content: String,
}

#[derive(Debug, Serialize)]
pub(super) struct EmbeddingsRequest {
    pub model: String,
    pub input: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct EmbeddingsResponse {
    #[serde(default)]
    pub data: Vec<EmbeddingItem>,
}

#[derive(Debug, Deserialize)]
pub(super) struct EmbeddingItem {
    pub index: usize,
    #[serde(default)]
    pub embedding: Vec<f32>,
}
