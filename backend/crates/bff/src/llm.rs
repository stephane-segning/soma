use reqwest::Client;
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;
use thiserror::Error;

#[derive(Clone)]
pub(crate) struct LlmClient {
    http: Client,
    endpoint: String,
    model: String,
    token: Option<String>,
}

impl LlmClient {
    pub(crate) fn from_env() -> Self {
        let endpoint = std::env::var("LLM_ENDPOINT")
            .unwrap_or_else(|_| "http://127.0.0.1:11434/api/generate".to_string());
        let model = std::env::var("LLM_MODEL").unwrap_or_else(|_| "llama3.2:1b".to_string());
        let timeout = std::env::var("LLM_TIMEOUT_MS")
            .ok()
            .and_then(|s| s.parse::<u64>().ok())
            .map(Duration::from_millis)
            .unwrap_or_else(|| Duration::from_secs(15));
        let token = std::env::var("LLM_TOKEN").ok();

        let http = Client::builder()
            .timeout(timeout)
            .build()
            .expect("construct reqwest client");

        Self {
            http,
            endpoint,
            model,
            token,
        }
    }

    pub(crate) async fn generate(
        &self,
        prompt: &str,
        user: Option<String>,
    ) -> Result<String, LlmError> {
        let req = LlmGenerateRequest {
            model: self.model.clone(),
            prompt: prompt.to_string(),
            stream: false,
            user,
        };

        let mut builder = self.http.post(&self.endpoint);
        if let Some(token) = &self.token {
            builder = builder.bearer_auth(token);
        }

        let resp = builder.json(&req).send().await.map_err(LlmError::Http)?;
        let status = resp.status();
        let body = resp.text().await.map_err(LlmError::Http)?;

        if !status.is_success() {
            return Err(LlmError::Backend(format!(
                "backend status {}: {}",
                status, body
            )));
        }

        parse_llm_reply(&body).ok_or_else(|| LlmError::Backend("empty reply".into()))
    }
}

#[derive(Debug, Serialize)]
struct LlmGenerateRequest {
    model: String,
    prompt: String,
    #[serde(default)]
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    user: Option<String>,
}

#[derive(Error, Debug)]
pub(crate) enum LlmError {
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("llm backend error: {0}")]
    Backend(String),
}

fn parse_llm_reply(body: &str) -> Option<String> {
    if let Ok(val) = serde_json::from_str::<Value>(body) {
        if let Some(resp) = val.get("response").and_then(Value::as_str) {
            return Some(resp.trim().to_string());
        }
        if let Some(resp) = val
            .get("message")
            .and_then(|m| m.get("content"))
            .and_then(Value::as_str)
        {
            return Some(resp.trim().to_string());
        }
        return parse_choice_reply(&val);
    }

    None
}

fn parse_choice_reply(val: &Value) -> Option<String> {
    let choice = val
        .get("choices")
        .and_then(|choices| choices.as_array())
        .and_then(|choices| choices.first())?;

    if let Some(content) = choice
        .get("message")
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
    {
        return Some(content.trim().to_string());
    }

    choice
        .get("text")
        .and_then(Value::as_str)
        .map(|text| text.trim().to_string())
}
