//! Search route — placeholder, mirrors `desktop_commands::search`.
//! The daemon doesn't expose a search endpoint yet so the underlying
//! handler returns an empty list; the route exists so the SDK call site
//! resolves uniformly across transports.

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State,
    routing::post,
};
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
    State(_app): State<Arc<AppState>>,
    Json(body): Json<SearchBody>,
) -> Result<Json<Vec<search::SearchResult>>, ApiError> {
    search::query(body.query).await.map(Json).map_err(ApiError::from)
}
