use std::{
    collections::BTreeMap,
    time::Duration,
};

use anyhow::{Context as AnyhowContext, anyhow};
use reqwest::{
    Client,
    header::{
        AUTHORIZATION,
        HeaderMap,
        HeaderValue,
    },
};
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc as tokio_mpsc;
use tracing::info;

use crate::config::AgentdConfig;

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

#[derive(Clone, Debug)]
pub struct EngineHandle {
    client: Client,
    config: AgentdConfig,
}

#[derive(Debug, Clone)]
pub enum EngineChatStreamEvent {
    Token(String),
    Done(String),
}

impl EngineHandle {
    pub fn spawn(config: AgentdConfig) -> anyhow::Result<Self> {
        let mut default_headers = HeaderMap::new();
        if let Some(api_key) = config.provider_api_key.as_deref() {
            let value = format!("Bearer {api_key}");
            default_headers.insert(
                AUTHORIZATION,
                HeaderValue::from_str(&value).context("invalid SOMA_AGENTD_PROVIDER_API_KEY")?,
            );
        }

        let client = Client::builder()
            .default_headers(default_headers)
            .timeout(Duration::from_millis(config.request_timeout_ms))
            .build()
            .context("failed to build provider HTTP client")?;

        info!(
            provider_base_url = %config.provider_base_url,
            default_chat_model = %config.default_chat_model,
            default_embed_model = %config.default_embed_model,
            "agentd OpenAI-compatible engine ready"
        );

        Ok(Self { client, config })
    }

    pub async fn status(&self) -> anyhow::Result<EngineStatus> {
        let models = self.list_models_inner().await?;
        Ok(EngineStatus {
            version: env!("CARGO_PKG_VERSION").to_string(),
            default_chat_model: self.config.default_chat_model.clone(),
            default_embed_model: self.config.default_embed_model.clone(),
            models,
        })
    }

    pub async fn chat(&self, request: ChatRequest) -> anyhow::Result<String> {
        let model = request
            .model
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(self.config.default_chat_model.as_str())
            .to_string();
        let max_tokens = if request.max_tokens == 0 {
            256
        } else {
            request.max_tokens
        };
        let temperature = if request.temperature <= 0.0 {
            0.7
        } else {
            request.temperature
        };

        let body = ChatCompletionRequest {
            model,
            messages: request.messages,
            temperature,
            max_tokens,
            stream: false,
        };

        let response = self
            .post_json::<_, ChatCompletionResponse>("/chat/completions", &body)
            .await?;

        if let Some(choice) = response.choices.into_iter().next() {
            if let Some(message) = choice.message {
                return Ok(message.content);
            }
            if let Some(text) = choice.text {
                return Ok(text);
            }
        }

        Ok(String::new())
    }

    pub async fn chat_stream(
        &self,
        request: ChatRequest,
    ) -> anyhow::Result<tokio_mpsc::UnboundedReceiver<anyhow::Result<EngineChatStreamEvent>>> {
        let (event_tx, event_rx) = tokio_mpsc::unbounded_channel();
        let output = self.chat(request).await?;
        if !output.is_empty() {
            let _ = event_tx.send(Ok(EngineChatStreamEvent::Token(output.clone())));
        }
        let _ = event_tx.send(Ok(EngineChatStreamEvent::Done(output)));
        Ok(event_rx)
    }

    pub async fn embed(&self, request: EmbedRequest) -> anyhow::Result<Vec<Vec<f32>>> {
        if request.input.is_empty() {
            return Ok(Vec::new());
        }

        let model = request
            .model
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(self.config.default_embed_model.as_str())
            .to_string();

        let body = EmbeddingsRequest {
            model,
            input: request.input.clone(),
        };

        let response = self
            .post_json::<_, EmbeddingsResponse>("/embeddings", &body)
            .await?;

        let mut indexed = vec![None; request.input.len()];
        for item in response.data {
            if item.index < indexed.len() {
                indexed[item.index] = Some(item.embedding);
            }
        }

        let mut output = Vec::with_capacity(request.input.len());
        for maybe in indexed {
            output.push(maybe.unwrap_or_default());
        }
        Ok(output)
    }

    async fn list_models_inner(&self) -> anyhow::Result<Vec<ModelInfo>> {
        let response = self.get_json::<ListModelsResponse>("/models").await?;
        let mut model_map = BTreeMap::<String, ModelInfo>::new();

        for entry in response.data {
            let name = entry.id.trim();
            if name.is_empty() {
                continue;
            }

            model_map.insert(
                name.to_string(),
                ModelInfo {
                    name: name.to_string(),
                    path: self.config.provider_base_url.clone(),
                    loaded: true,
                    kind: ModelKind::Unknown,
                    size_bytes: None,
                },
            );
        }

        for (fallback_model, kind) in [
            (&self.config.default_chat_model, ModelKind::Chat),
            (&self.config.default_embed_model, ModelKind::Embed),
        ] {
            let name = fallback_model.trim();
            if name.is_empty() {
                continue;
            }
            model_map.entry(name.to_string()).or_insert_with(|| ModelInfo {
                name: name.to_string(),
                path: self.config.provider_base_url.clone(),
                loaded: true,
                kind,
                size_bytes: None,
            });
        }

        Ok(model_map.into_values().collect())
    }

    async fn get_json<T>(&self, path: &str) -> anyhow::Result<T>
    where
        T: for<'de> Deserialize<'de>,
    {
        let url = format!("{}{}", self.config.provider_base_url, path);
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .with_context(|| format!("provider request failed: GET {url}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(anyhow!("provider request failed: GET {url} -> {status}: {body}"));
        }

        response
            .json::<T>()
            .await
            .with_context(|| format!("provider response decode failed: GET {url}"))
    }

    async fn post_json<B, T>(&self, path: &str, body: &B) -> anyhow::Result<T>
    where
        B: Serialize + ?Sized,
        T: for<'de> Deserialize<'de>,
    {
        let url = format!("{}{}", self.config.provider_base_url, path);
        let response = self
            .client
            .post(&url)
            .json(body)
            .send()
            .await
            .with_context(|| format!("provider request failed: POST {url}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(anyhow!("provider request failed: POST {url} -> {status}: {body}"));
        }

        response
            .json::<T>()
            .await
            .with_context(|| format!("provider response decode failed: POST {url}"))
    }
}

#[derive(Debug, Deserialize)]
struct ListModelsResponse {
    #[serde(default)]
    data: Vec<ModelEntry>,
}

#[derive(Debug, Deserialize)]
struct ModelEntry {
    #[serde(default)]
    id: String,
}

#[derive(Debug, Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    #[serde(rename = "max_tokens")]
    max_tokens: u64,
    stream: bool,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    #[serde(default)]
    choices: Vec<ChatCompletionChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionChoice {
    message: Option<ChatCompletionMessage>,
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionMessage {
    content: String,
}

#[derive(Debug, Serialize)]
struct EmbeddingsRequest {
    model: String,
    input: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct EmbeddingsResponse {
    #[serde(default)]
    data: Vec<EmbeddingItem>,
}

#[derive(Debug, Deserialize)]
struct EmbeddingItem {
    index: usize,
    #[serde(default)]
    embedding: Vec<f32>,
}
