use base64::{Engine as _, engine::general_purpose};
use serde::{Deserialize, Serialize};
//use tauri_plugin_log::log::info;
use tracing::info;
use soma_proto_build::agent;

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

    pub async fn list_models(&self) -> AppResult<Vec<ModelInfoDto>> {
        let res = self.state.agent.list_models().await?;
        Ok(res
            .models
            .into_iter()
            .map(|m| ModelInfoDto {
                name: m.name,
                kind: model_kind_label(m.kind).to_string(),
                path: m.path,
                loaded: m.loaded,
                size_bytes: m.size_bytes,
            })
            .collect())
    }

    pub async fn rerank(&self, params: RerankParams) -> AppResult<Vec<RerankResultDto>> {
        if params.query.trim().is_empty() {
            return Err(AppError::Agent("query is required".to_string()));
        }
        if params.candidates.is_empty() {
            return Err(AppError::Agent(
                "at least one candidate is required".to_string(),
            ));
        }

        let candidates = params
            .candidates
            .into_iter()
            .map(|c| agent::RerankCandidate {
                id: c.id,
                content: c.content,
            })
            .collect();

        let req = agent::RerankRequest {
            query: params.query,
            candidates,
            model: params.model.unwrap_or_default(),
            top_n: params.top_n.unwrap_or_default(),
        };

        let res = self.state.agent.rerank(req).await?;
        let mut results = res
            .results
            .into_iter()
            .map(|r| RerankResultDto {
                id: r.id,
                score: r.score,
                rank: r.rank,
            })
            .collect::<Vec<_>>();

        results.sort_by_key(|r| r.rank);
        Ok(results)
    }

    pub async fn resolve_drift(&self, params: ResolveDriftParams) -> AppResult<ResolveDriftResult> {
        let left = decode_update(&params.left_update_base64, "left_update_base64")?;
        let right = decode_update(&params.right_update_base64, "right_update_base64")?;

        let res = self
            .state
            .agent
            .resolve_drift(agent::ResolveDriftRequest {
                left_update: left,
                right_update: right,
            })
            .await?;

        Ok(ResolveDriftResult {
            merged_update_base64: general_purpose::STANDARD.encode(res.merged_update),
        })
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfoDto {
    pub name: String,
    pub kind: String,
    pub path: String,
    pub loaded: bool,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RerankCandidateParam {
    pub id: String,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RerankParams {
    pub query: String,
    pub candidates: Vec<RerankCandidateParam>,
    pub model: Option<String>,
    #[serde(rename = "topN", alias = "top_n")]
    pub top_n: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RerankResultDto {
    pub id: String,
    pub score: f64,
    pub rank: u32,
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

fn model_kind_label(kind: i32) -> &'static str {
    match agent::ModelKind::try_from(kind).unwrap_or(agent::ModelKind::Unspecified) {
        agent::ModelKind::Chat => "chat",
        agent::ModelKind::Embed => "embed",
        _ => "unknown",
    }
}

fn decode_update(encoded: &str, field: &str) -> AppResult<Vec<u8>> {
    if encoded.trim().is_empty() {
        return Err(AppError::Agent(format!("{field} is required")));
    }
    general_purpose::STANDARD
        .decode(encoded)
        .map_err(|err| AppError::Agent(format!("{field} is not valid base64: {err}")))
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
