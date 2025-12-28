use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::state::ManagedState;

#[derive(Clone)]
pub struct AgentController {
    state: ManagedState,
}

impl AgentController {
    pub fn new(state: ManagedState) -> Self {
        Self { state }
    }

    pub async fn chat_stream(&self, params: ChatParams) -> AppResult<ChatStreamEvent> {
        if params.messages.is_empty() {
            return Ok(ChatStreamEvent {
                token: None,
                done: true,
                error: Some("no messages provided".to_string()),
            });
        }

        let req = SomaChat::build_request(
            params.messages,
            params.model,
            params.temperature,
            params.max_tokens,
        )?;

        match self.state.agent.chat(req).await {
            Ok(resp) => {
                let content = SomaChat::normalize_response(resp.content);
                Ok(ChatStreamEvent {
                    token: Some(content),
                    done: true,
                    error: None,
                })
            }
            Err(err) => Ok(ChatStreamEvent {
                token: None,
                done: true,
                error: Some(err.to_string()),
            }),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatStreamEvent {
    pub token: Option<String>,
    pub done: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatParams {
    pub messages: Vec<ChatMessage>,
    pub model: Option<String>,
    pub temperature: Option<f32>,
    #[serde(rename = "maxTokens", alias = "max_tokens")]
    pub max_tokens: Option<u64>,
}

struct SomaChat;

impl SomaChat {
    const DEFAULT_SYSTEM_PROMPT: &'static str =
        "You’re the Soma assistant. Keep replies concise and helpful.";

    fn build_request(
        messages: Vec<ChatMessage>,
        model: Option<String>,
        temperature: Option<f32>,
        max_tokens: Option<u64>,
    ) -> Result<soma_proto_build::agent::ChatRequest, AppError> {
        let system = Self::extract_system(&messages);
        let mut out_messages = Vec::new();
        out_messages.push(soma_proto_build::agent::ChatMessage {
            role: "system".to_string(),
            content: system,
        });

        for msg in messages {
            let role = msg.role.trim().to_lowercase();
            if role == "system" {
                continue;
            }
            let content = msg.content.trim().to_string();
            if content.is_empty() {
                continue;
            }
            let normalized_role = match role.as_str() {
                "assistant" => "assistant",
                "user" => "user",
                _ => "user",
            };
            out_messages.push(soma_proto_build::agent::ChatMessage {
                role: normalized_role.to_string(),
                content,
            });
        }

        if !out_messages.iter().any(|m| m.role == "user") {
            return Err(AppError::Agent("no user message provided".to_string()));
        }

        Ok(soma_proto_build::agent::ChatRequest {
            model: model.unwrap_or_default(),
            messages: out_messages,
            temperature: temperature.unwrap_or(0.7),
            max_tokens: max_tokens.unwrap_or(256),
        })
    }

    fn extract_system(messages: &[ChatMessage]) -> String {
        messages
            .iter()
            .find(|m| m.role.trim().eq_ignore_ascii_case("system"))
            .map(|m| m.content.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| Self::DEFAULT_SYSTEM_PROMPT.to_string())
    }

    fn normalize_response(content: String) -> String {
        content.trim().to_string()
    }
}
