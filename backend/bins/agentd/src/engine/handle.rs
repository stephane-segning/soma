use std::{collections::BTreeMap, time::Duration};

use anyhow::Context as AnyhowContext;
use reqwest::{
    Client,
    header::{AUTHORIZATION, HeaderMap, HeaderValue},
};
use tokio::sync::mpsc as tokio_mpsc;
use tracing::info;

use crate::config::AgentdConfig;

use super::{
    protocol::{
        ChatCompletionRequest, ChatCompletionResponse, EmbeddingsRequest, EmbeddingsResponse,
        ListModelsResponse,
    },
    types::{
        ChatRequest, EmbedRequest, EngineChatStreamEvent, EngineStatus, ModelInfo, ModelKind,
    },
};

#[derive(Clone, Debug)]
pub struct EngineHandle {
    pub(super) client: Client,
    pub(super) config: AgentdConfig,
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
        Ok(EngineStatus {
            version: env!("CARGO_PKG_VERSION").to_string(),
            default_chat_model: self.config.default_chat_model.clone(),
            default_embed_model: self.config.default_embed_model.clone(),
            models: self.list_models_inner().await?,
        })
    }

    pub async fn chat(&self, request: ChatRequest) -> anyhow::Result<String> {
        let body = ChatCompletionRequest {
            model: self.chat_model(request.model.as_deref()),
            messages: request.messages,
            temperature: normalized_temperature(request.temperature),
            max_tokens: normalized_max_tokens(request.max_tokens),
            stream: false,
        };
        let response = self
            .post_json::<_, ChatCompletionResponse>("/chat/completions", &body)
            .await?;

        for choice in response.choices {
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

        let body = EmbeddingsRequest {
            model: self.embed_model(request.model.as_deref()),
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

        Ok(indexed
            .into_iter()
            .map(|maybe| maybe.unwrap_or_default())
            .collect())
    }

    async fn list_models_inner(&self) -> anyhow::Result<Vec<ModelInfo>> {
        let response = self.get_json::<ListModelsResponse>("/models").await?;
        let mut model_map = BTreeMap::<String, ModelInfo>::new();

        for entry in response.data {
            let name = entry.id.trim();
            if !name.is_empty() {
                model_map.insert(name.to_string(), self.model_info(name, ModelKind::Unknown));
            }
        }

        for (fallback_model, kind) in [
            (&self.config.default_chat_model, ModelKind::Chat),
            (&self.config.default_embed_model, ModelKind::Embed),
        ] {
            let name = fallback_model.trim();
            if !name.is_empty() {
                model_map
                    .entry(name.to_string())
                    .or_insert_with(|| self.model_info(name, kind));
            }
        }

        Ok(model_map.into_values().collect())
    }

    fn model_info(&self, name: &str, kind: ModelKind) -> ModelInfo {
        ModelInfo {
            name: name.to_string(),
            path: self.config.provider_base_url.clone(),
            loaded: true,
            kind,
            size_bytes: None,
        }
    }

    fn chat_model(&self, model: Option<&str>) -> String {
        model
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(self.config.default_chat_model.as_str())
            .to_string()
    }

    fn embed_model(&self, model: Option<&str>) -> String {
        model
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(self.config.default_embed_model.as_str())
            .to_string()
    }
}

fn normalized_max_tokens(max_tokens: u64) -> u64 {
    if max_tokens == 0 { 256 } else { max_tokens }
}

fn normalized_temperature(temperature: f32) -> f32 {
    if temperature <= 0.0 { 0.7 } else { temperature }
}
