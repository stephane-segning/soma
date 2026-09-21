//! Agent provider config routes — get / set / clear for the default and
//! space scopes, plus validation. 1:1 with `desktop_commands::agent_config::*`.

use std::sync::Arc;

use axum::{Json, Router, extract::State, routing::post};
use desktop_api::{AppState, agent_config};
use serde::Deserialize;

use crate::error::ApiError;

pub(super) fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v1/agent_config_get_default", post(get_default))
        .route("/api/v1/agent_config_get_space", post(get_space))
        .route("/api/v1/agent_config_set_default", post(set_default))
        .route("/api/v1/agent_config_set_space", post(set_space))
        .route("/api/v1/agent_config_clear_default", post(clear_default))
        .route("/api/v1/agent_config_clear_space", post(clear_space))
        .route("/api/v1/agent_config_validate", post(validate))
}

/// `agent_config_get_space` / `agent_config_clear_space` take a bare
/// `space_id: String` Tauri-side — same `{ spaceId }` body shape as
/// `spaces_list_members` et al.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpaceIdBody {
    space_id: String,
}

async fn get_default(
    State(app): State<Arc<AppState>>,
) -> Result<Json<agent_config::AgentProviderConfigView>, ApiError> {
    agent_config::get_default(&app).await.map(Json).map_err(ApiError::from)
}

async fn get_space(
    State(app): State<Arc<AppState>>,
    Json(body): Json<SpaceIdBody>,
) -> Result<Json<agent_config::AgentProviderConfigView>, ApiError> {
    agent_config::get_space(&app, body.space_id)
        .await
        .map(Json)
        .map_err(ApiError::from)
}

async fn set_default(
    State(app): State<Arc<AppState>>,
    Json(args): Json<agent_config::SetDefaultAgentProviderConfigArgs>,
) -> Result<Json<agent_config::AgentProviderConfigView>, ApiError> {
    agent_config::set_default(&app, args).await.map(Json).map_err(ApiError::from)
}

async fn set_space(
    State(app): State<Arc<AppState>>,
    Json(args): Json<agent_config::SetSpaceAgentProviderConfigArgs>,
) -> Result<Json<agent_config::AgentProviderConfigView>, ApiError> {
    agent_config::set_space(&app, args).await.map(Json).map_err(ApiError::from)
}

async fn clear_default(State(app): State<Arc<AppState>>) -> Result<Json<bool>, ApiError> {
    agent_config::clear_default(&app).await.map(Json).map_err(ApiError::from)
}

async fn clear_space(
    State(app): State<Arc<AppState>>,
    Json(body): Json<SpaceIdBody>,
) -> Result<Json<bool>, ApiError> {
    agent_config::clear_space(&app, body.space_id)
        .await
        .map(Json)
        .map_err(ApiError::from)
}

async fn validate(
    State(app): State<Arc<AppState>>,
    Json(args): Json<agent_config::ValidateAgentProviderConfigArgs>,
) -> Result<Json<agent_config::ValidateAgentProviderConfigResult>, ApiError> {
    agent_config::validate(&app, args).await.map(Json).map_err(ApiError::from)
}
