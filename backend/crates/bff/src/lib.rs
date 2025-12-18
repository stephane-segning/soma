use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    routing::{get, post},
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use tracing::info;

#[derive(Clone)]
struct BffState {
    started_at: Instant,
    llm: Arc<LlmClient>,
}

impl Default for BffState {
    fn default() -> Self {
        Self {
            started_at: Instant::now(),
            llm: Arc::new(LlmClient::from_env()),
        }
    }
}

#[derive(Debug, Serialize)]
struct InfoResponse {
    status: &'static str,
    version: &'static str,
    uptime_secs: u64,
}

#[derive(Debug, Deserialize)]
struct ChatRequest {
    prompt: String,
    #[serde(default)]
    user: Option<String>,
}

#[derive(Debug, Serialize)]
struct ChatResponse {
    reply: String,
    latency_ms: u64,
}

#[derive(Debug, Serialize)]
struct ErrorResponse {
    error: String,
}

/// Build the BFF application router (business APIs go here).
pub fn app() -> Router {
    app_with_state(BffState::default())
}

fn app_with_state(state: BffState) -> Router {
    let shared = Arc::new(state);
    Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/v1/info", get(get_info).with_state(Arc::clone(&shared)))
        .route("/v1/chat", post(chat).with_state(Arc::clone(&shared)))
}

/// Run the BFF service on the provided address with the given router.
pub async fn run(http_addr: std::net::SocketAddr, app: Router) -> soma_core::SomaResult<()> {
    let listener = tokio::net::TcpListener::bind(http_addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn get_info(State(state): State<Arc<BffState>>) -> Json<InfoResponse> {
    Json(InfoResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
        uptime_secs: state.started_at.elapsed().as_secs(),
    })
}

async fn chat(
    State(state): State<Arc<BffState>>,
    Json(payload): Json<ChatRequest>,
) -> Result<Json<ChatResponse>, (StatusCode, Json<ErrorResponse>)> {
    info!(user = ?payload.user, "handling chat request");
    let start = Instant::now();

    match state.llm.generate(&payload.prompt, payload.user.clone()).await {
        Ok(reply) => Ok(Json(ChatResponse {
            reply,
            latency_ms: millis(start.elapsed()),
        })),
        Err(err) => Err((
            StatusCode::BAD_GATEWAY,
            Json(ErrorResponse {
                error: err.to_string(),
            }),
        )),
    }
}

fn millis(dur: Duration) -> u64 {
    dur.as_millis().try_into().unwrap_or(u64::MAX)
}

#[derive(Clone)]
struct LlmClient {
    http: Client,
    endpoint: String,
    model: String,
    token: Option<String>,
}

impl LlmClient {
    fn from_env() -> Self {
        let endpoint = std::env::var("LLM_ENDPOINT")
            .unwrap_or_else(|_| "http://127.0.0.1:11434/api/generate".to_string());
        let model = std::env::var("LLM_MODEL").unwrap_or_else(|_| "llama3".to_string());
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

    async fn generate(
        &self,
        prompt: &str,
        user: Option<String>,
    ) -> Result<String, LlmError> {
        let req = OllamaGenerateRequest {
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
struct OllamaGenerateRequest {
    model: String,
    prompt: String,
    #[serde(default)]
    stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    user: Option<String>,
}

#[derive(Error, Debug)]
enum LlmError {
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("llm backend error: {0}")]
    Backend(String),
}

fn parse_llm_reply(body: &str) -> Option<String> {
    // Try Ollama-style first.
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
        if let Some(choice) = val
            .get("choices")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
        {
            if let Some(content) = choice
                .get("message")
                .and_then(|m| m.get("content"))
                .and_then(Value::as_str)
            {
                return Some(content.trim().to_string());
            }
            if let Some(text) = choice.get("text").and_then(Value::as_str) {
                return Some(text.trim().to_string());
            }
        }
    }

    None
}
