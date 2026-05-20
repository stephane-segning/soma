//! Cross-module DTOs. camelCase on the wire so the renderer's existing
//! `@soma/desktop-db` parsers and call sites keep working after the cutover.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AgentProvider {
    /// Any HTTP endpoint speaking the OpenAI REST shape (Ollama, vLLM, OpenAI proper, etc.).
    OpenAiCompatible,
}

impl Default for AgentProvider {
    fn default() -> Self {
        Self::OpenAiCompatible
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ChatRole {
    System,
    User,
    Assistant,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: ChatRole,
    pub content: String,
}

#[derive(Debug, Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatOptions {
    pub model: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub space_id: Option<String>,
}

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatResponse {
    /// Final assistant content. Non-streaming today; the field is named
    /// `token` for parity with the old TS `StreamEvent.token` so the
    /// renderer doesn't need a rename.
    pub token: String,
    pub done: bool,
    /// Empty when the call succeeded.
    pub error: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ModelKind {
    Chat,
    Embed,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentModel {
    pub name: String,
    pub kind: ModelKind,
    pub path: String,
    pub loaded: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RerankCandidate {
    pub id: String,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RerankParams {
    pub query: String,
    pub candidates: Vec<RerankCandidate>,
    pub model: Option<String>,
    pub top_n: Option<usize>,
    pub space_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RerankResult {
    pub id: String,
    pub score: f32,
    pub rank: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveDriftParams {
    pub left_update_base64: String,
    pub right_update_base64: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveDriftResult {
    pub merged_update_base64: String,
}

// --- Background tasks --------------------------------------------------------

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum BackgroundTaskKind {
    ExplainSelection,
    ExpandSelection,
    ResearchSelection,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BackgroundTaskStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundTask {
    pub task_id: String,
    pub kind: BackgroundTaskKind,
    pub status: BackgroundTaskStatus,
    pub space_id: String,
    pub document_id: String,
    pub selection_text: String,
    pub persist_in_document: bool,
    pub result_text: String,
    pub error: String,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueBackgroundTaskParams {
    pub kind: BackgroundTaskKind,
    pub space_id: String,
    pub document_id: String,
    pub selection_text: String,
    pub model: Option<String>,
    #[serde(default)]
    pub persist_in_document: bool,
}

#[derive(Debug, Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListBackgroundTasksParams {
    pub space_id: Option<String>,
    pub limit: Option<usize>,
}

// --- Runtime events ----------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum AgentRuntimeEvent {
    #[serde(rename_all = "camelCase")]
    Ready {
        at_ms: i64,
        provider: AgentProvider,
        base_url: String,
    },
    #[serde(rename_all = "camelCase")]
    Status {
        at_ms: i64,
        provider: AgentProvider,
        base_url: String,
        models: Vec<AgentModel>,
    },
    #[serde(rename_all = "camelCase")]
    Error {
        at_ms: i64,
        provider: AgentProvider,
        base_url: String,
        error: String,
    },
}

pub fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
