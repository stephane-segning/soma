//! OpenAI-compatible HTTP provider. One `reqwest::Client` is reused across
//! all calls (it pools connections internally); the per-call resolved
//! config supplies base URL / API key / timeout.

use std::time::Duration;

use async_trait::async_trait;
use desktop_core::error::{DesktopError, DesktopResult};
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::config::ResolvedWorkspaceAgentConfig;
use crate::provider::ChatProvider;
use crate::types::{AgentModel, ChatMessage, ChatOptions, ChatResponse, ModelKind};

pub struct OpenAiProvider {
    http: Client,
    config: ResolvedWorkspaceAgentConfig,
}

impl OpenAiProvider {
    pub fn new(http: Client, config: ResolvedWorkspaceAgentConfig) -> Self {
        Self { http, config }
    }

    fn endpoint(&self, path: &str) -> String {
        format!("{}{path}", self.config.open_ai_base_url)
    }

    fn timeout(&self) -> Duration {
        Duration::from_millis(self.config.request_timeout_ms)
    }

    fn auth_header(&self) -> Option<String> {
        let key = self.config.open_ai_api_key.trim();
        if key.is_empty() { None } else { Some(format!("Bearer {key}")) }
    }

    async fn post_json<B: Serialize, R: serde::de::DeserializeOwned>(&self, path: &str, body: &B) -> DesktopResult<R> {
        let mut req = self.http.post(self.endpoint(path)).timeout(self.timeout()).json(body);
        if let Some(auth) = self.auth_header() {
            req = req.header(reqwest::header::AUTHORIZATION, auth);
        }
        ok(req).await
    }

    async fn get_json<R: serde::de::DeserializeOwned>(&self, path: &str) -> DesktopResult<R> {
        let mut req = self.http.get(self.endpoint(path)).timeout(self.timeout());
        if let Some(auth) = self.auth_header() {
            req = req.header(reqwest::header::AUTHORIZATION, auth);
        }
        ok(req).await
    }
}

/// Send the request, surface non-2xx as `DesktopError::Agent`, and decode
/// JSON. Centralised here so chat/list/embed all share the same failure
/// envelope.
async fn ok<R: serde::de::DeserializeOwned>(req: reqwest::RequestBuilder) -> DesktopResult<R> {
    let resp = req.send().await.map_err(agent_err)?;
    if !resp.status().is_success() {
        return Err(DesktopError::Agent {
            message: format!("agent provider request failed: {}", resp.status()),
        });
    }
    resp.json::<R>().await.map_err(agent_err)
}

fn agent_err(e: impl std::fmt::Display) -> DesktopError {
    DesktopError::Agent { message: e.to_string() }
}

// --- Wire shapes ------------------------------------------------------------

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: &'a [ChatMessage],
    temperature: f32,
    max_tokens: u32,
    stream: bool,
}

#[derive(Deserialize)]
struct ChatChoice {
    #[serde(default)]
    message: Option<ChatChoiceMessage>,
    #[serde(default)]
    text: Option<String>,
}

#[derive(Deserialize)]
struct ChatChoiceMessage {
    #[serde(default)]
    content: Option<String>,
}

#[derive(Deserialize)]
struct ChatCompletionResponse {
    #[serde(default)]
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ModelsResponse {
    #[serde(default)]
    data: Vec<ModelEntry>,
}

#[derive(Deserialize)]
struct ModelEntry {
    #[serde(default)]
    id: Option<String>,
}

#[derive(Serialize)]
struct EmbedRequest<'a> {
    model: &'a str,
    input: &'a [&'a str],
}

#[derive(Deserialize)]
struct EmbedResponse {
    #[serde(default)]
    data: Vec<EmbedEntry>,
}

#[derive(Deserialize)]
struct EmbedEntry {
    #[serde(default)]
    index: Option<usize>,
    #[serde(default)]
    embedding: Option<Vec<f32>>,
}

// --- ChatProvider impl ------------------------------------------------------

#[async_trait]
impl ChatProvider for OpenAiProvider {
    async fn chat(&self, messages: &[ChatMessage], opts: &ChatOptions) -> DesktopResult<ChatResponse> {
        let model = opts
            .model
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(&self.config.chat_model);
        let body = ChatRequest {
            model,
            messages,
            temperature: opts.temperature.unwrap_or(0.7),
            max_tokens: opts.max_tokens.unwrap_or(256),
            stream: false,
        };
        let resp: ChatCompletionResponse = self.post_json("/chat/completions", &body).await?;
        let content = resp
            .choices
            .into_iter()
            .next()
            .map(|c| c.message.and_then(|m| m.content).or(c.text).unwrap_or_default())
            .unwrap_or_default();
        Ok(ChatResponse {
            token: content,
            done: true,
            error: String::new(),
        })
    }

    async fn list_models(&self) -> DesktopResult<Vec<AgentModel>> {
        let resp: ModelsResponse = self.get_json("/models").await?;
        Ok(resp
            .data
            .into_iter()
            .filter_map(|m| m.id.map(|s| s.trim().to_owned()).filter(|s| !s.is_empty()))
            .map(|name| AgentModel {
                name,
                kind: ModelKind::Unknown,
                path: self.config.open_ai_base_url.clone(),
                loaded: true,
                size_bytes: None,
            })
            .collect())
    }

    async fn embed(&self, model: &str, texts: &[&str]) -> DesktopResult<Vec<Vec<f32>>> {
        let body = EmbedRequest { model, input: texts };
        let resp: EmbedResponse = self.post_json("/embeddings", &body).await?;
        let mut out: Vec<Vec<f32>> = vec![Vec::new(); texts.len()];
        for entry in resp.data {
            let Some(idx) = entry.index else { continue };
            if idx >= out.len() {
                continue;
            }
            if let Some(vec) = entry.embedding {
                out[idx] = vec;
            }
        }
        Ok(out)
    }
}
