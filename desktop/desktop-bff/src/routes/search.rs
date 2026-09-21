//! Search route — mirrors `desktop_commands::search`. See
//! `desktop_api::search` for the handler, and
//! `soma_daemon::DaemonHandle::search` / `soma_storage::search` for the
//! membership-scoping and matching rules.

use std::sync::Arc;

use axum::{Json, Router, extract::State, routing::post};
use desktop_api::{AppState, search};
use serde::Deserialize;

use crate::error::ApiError;

pub(super) fn router() -> Router<Arc<AppState>> {
    Router::new().route("/api/v1/search", post(search))
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchBody {
    #[serde(default)]
    query: Option<String>,
}

async fn search(
    State(app): State<Arc<AppState>>,
    Json(body): Json<SearchBody>,
) -> Result<Json<Vec<search::SearchResult>>, ApiError> {
    search::query(&app, body.query).await.map(Json).map_err(ApiError::from)
}
