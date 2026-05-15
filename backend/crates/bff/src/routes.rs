use crate::state::BffState;
use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::info;

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

/// Build the BFF application router.
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

    match state
        .llm
        .generate(&payload.prompt, payload.user.clone())
        .await
    {
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
