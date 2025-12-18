use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::{
    Json, Router,
    extract::State,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use tracing::info;

#[derive(Clone)]
struct BffState {
    started_at: Instant,
}

impl Default for BffState {
    fn default() -> Self {
        Self {
            started_at: Instant::now(),
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
) -> Json<ChatResponse> {
    // TODO: Connect to the actual LLM backend; for now we round-trip the prompt so the path is wired.
    let latency = state.started_at.elapsed();
    info!(user = ?payload.user, "handling chat request");

    Json(ChatResponse {
        reply: format!("echo: {}", payload.prompt.trim()),
        latency_ms: millis(latency),
    })
}

fn millis(dur: Duration) -> u64 {
    dur.as_millis().try_into().unwrap_or(u64::MAX)
}
