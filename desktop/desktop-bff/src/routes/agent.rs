//! Agent routes — chat, model listing, rerank, drift resolution,
//! background-task surface. 1:1 with `desktop_commands::agent::*`.
//!
//! `agent_chat_stream` here is a single-shot HTTP call: the underlying
//! `desktop_api::agent::chat_stream` returns a fully-buffered
//! `ChatResponse` rather than a stream of deltas (the renderer that
//! actually wants tokens-as-they-arrive uses OpenAI HTTP directly, see
//! the AGENTS.md note on the deferred `chat_stream`). When a real
//! streaming surface lands it will get its own SSE/WebSocket route — for
//! now this one keeps the SDK call site working against the BFF.

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State,
    routing::post,
};
use desktop_agent::{
    BackgroundTask, ChatResponse, EnqueueBackgroundTaskParams, ListBackgroundTasksParams, RerankParams, RerankResult,
    ResolveDriftParams, ResolveDriftResult,
};
use desktop_api::{AppState, agent};
use serde::Deserialize;

use crate::error::ApiError;

pub(super) fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v1/agent_chat_stream", post(agent_chat_stream))
        .route("/api/v1/agent_list_models", post(agent_list_models))
        .route("/api/v1/agent_rerank", post(agent_rerank))
        .route("/api/v1/agent_resolve_drift", post(agent_resolve_drift))
        .route(
            "/api/v1/agent_enqueue_background_task",
            post(agent_enqueue_background_task),
        )
        .route(
            "/api/v1/agent_list_background_tasks",
            post(agent_list_background_tasks),
        )
}

// --- Positional-arg request bodies ------------------------------------------

/// `agent_list_models` and a handful of other commands take an
/// `Option<String>` `spaceId`. The SDK ships `{ spaceId: string | null }`,
/// so we accept either `null` or omission via `#[serde(default)]`.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OptionalSpaceIdBody {
    #[serde(default)]
    space_id: Option<String>,
}


// --- Handlers ---------------------------------------------------------------

async fn agent_chat_stream(
    State(app): State<Arc<AppState>>,
    Json(args): Json<agent::ChatStreamArgs>,
) -> Result<Json<ChatResponse>, ApiError> {
    agent::chat_stream(&app, args).await.map(Json).map_err(ApiError::from)
}

async fn agent_list_models(
    State(app): State<Arc<AppState>>,
    Json(body): Json<OptionalSpaceIdBody>,
) -> Result<Json<Vec<agent::AgentModel>>, ApiError> {
    agent::list_models(&app, body.space_id)
        .await
        .map(Json)
        .map_err(ApiError::from)
}

async fn agent_rerank(
    State(app): State<Arc<AppState>>,
    Json(args): Json<RerankParams>,
) -> Result<Json<Vec<RerankResult>>, ApiError> {
    agent::rerank(&app, args).await.map(Json).map_err(ApiError::from)
}

async fn agent_resolve_drift(
    State(app): State<Arc<AppState>>,
    Json(args): Json<ResolveDriftParams>,
) -> Result<Json<ResolveDriftResult>, ApiError> {
    agent::resolve_drift(&app, args).await.map(Json).map_err(ApiError::from)
}

async fn agent_enqueue_background_task(
    State(app): State<Arc<AppState>>,
    Json(args): Json<EnqueueBackgroundTaskParams>,
) -> Result<Json<BackgroundTask>, ApiError> {
    agent::enqueue_background_task(&app, args)
        .await
        .map(Json)
        .map_err(ApiError::from)
}

async fn agent_list_background_tasks(
    State(app): State<Arc<AppState>>,
    Json(args): Json<ListBackgroundTasksParams>,
) -> Result<Json<Vec<BackgroundTask>>, ApiError> {
    agent::list_background_tasks(&app, args)
        .await
        .map(Json)
        .map_err(ApiError::from)
}
