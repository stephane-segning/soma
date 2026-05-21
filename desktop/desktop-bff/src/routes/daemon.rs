//! Daemon status + lifecycle routes. Mirrors
//! `desktop_commands::daemon::*`. The `daemon_status` and `daemon_ready`
//! handlers take no args, so they omit the `Json` extractor — an empty
//! body (or `{}`) still POSTs cleanly.

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State,
    routing::post,
};
use desktop_api::{AppState, daemon};

use crate::error::ApiError;

pub(super) fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v1/daemon_status", post(daemon_status))
        .route("/api/v1/daemon_ready", post(daemon_ready))
        .route("/api/v1/daemon_control", post(daemon_control))
}

/// `POST /api/v1/daemon_status` accepts an empty body — the handler
/// takes no arguments. We don't deserialize anything from the request to
/// keep the SDK call (which sends `{}` as args) happy without forcing it
/// to invent a non-args struct on the Rust side.
async fn daemon_status(
    State(app): State<Arc<AppState>>,
) -> Result<Json<daemon::DaemonStatus>, ApiError> {
    daemon::status(&app).await.map(Json).map_err(ApiError::from)
}

async fn daemon_ready(State(app): State<Arc<AppState>>) -> Result<Json<bool>, ApiError> {
    daemon::ready(&app).await.map(Json).map_err(ApiError::from)
}

async fn daemon_control(
    State(app): State<Arc<AppState>>,
    Json(args): Json<daemon::ControlArgs>,
) -> Result<Json<daemon::ControlResult>, ApiError> {
    daemon::control(&app, args).await.map(Json).map_err(ApiError::from)
}
