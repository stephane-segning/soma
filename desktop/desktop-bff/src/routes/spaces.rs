//! Spaces / membership / join routes. 1:1 with
//! `desktop_commands::spaces::*`; every command in that module gets a
//! sibling `POST /api/v1/<command_name>` here.

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State,
    routing::post,
};
use desktop_api::{AppState, spaces};
use serde::Deserialize;

use crate::error::ApiError;

pub(super) fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v1/spaces_list", post(spaces_list))
        .route("/api/v1/spaces_create", post(spaces_create))
        .route("/api/v1/spaces_get", post(spaces_get))
        .route("/api/v1/spaces_update", post(spaces_update))
        .route("/api/v1/spaces_delete", post(spaces_delete))
        .route("/api/v1/spaces_list_members", post(spaces_list_members))
        .route("/api/v1/spaces_list_my_memberships", post(spaces_list_my_memberships))
        .route("/api/v1/spaces_list_bots", post(spaces_list_bots))
        .route("/api/v1/spaces_join", post(spaces_join))
        .route("/api/v1/spaces_decide_join", post(spaces_decide_join))
        .route("/api/v1/spaces_list_join_requests", post(spaces_list_join_requests))
        .route("/api/v1/spaces_revoke_member", post(spaces_revoke_member))
        .route(
            "/api/v1/spaces_issue_issuer_capability",
            post(spaces_issue_issuer_capability),
        )
}

// --- Positional-arg request bodies ------------------------------------------
//
// The Tauri commands take individual parameters (`space_id: String`);
// Tauri's `invoke` wraps them into `{ spaceId }` on the wire. We model the
// same shape with small `#[serde(rename_all = "camelCase")]` structs so the
// JSON body matches what the SDK sends today.

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpaceIdBody {
    space_id: String,
}

// --- Handlers ---------------------------------------------------------------

async fn spaces_list(
    State(app): State<Arc<AppState>>,
    Json(args): Json<spaces::ListSpacesArgs>,
) -> Result<Json<spaces::ListSpacesResult>, ApiError> {
    spaces::list(&app, args).await.map(Json).map_err(ApiError::from)
}

async fn spaces_create(
    State(app): State<Arc<AppState>>,
    Json(args): Json<spaces::CreateSpaceArgs>,
) -> Result<Json<spaces::StoredSpace>, ApiError> {
    spaces::create(&app, args).await.map(Json).map_err(ApiError::from)
}

async fn spaces_get(
    State(app): State<Arc<AppState>>,
    Json(body): Json<SpaceIdBody>,
) -> Result<Json<spaces::StoredSpace>, ApiError> {
    spaces::get(&app, body.space_id).await.map(Json).map_err(ApiError::from)
}

async fn spaces_update(
    State(app): State<Arc<AppState>>,
    Json(args): Json<spaces::UpdateSpaceArgs>,
) -> Result<Json<spaces::StoredSpace>, ApiError> {
    spaces::update(&app, args).await.map(Json).map_err(ApiError::from)
}

async fn spaces_delete(
    State(app): State<Arc<AppState>>,
    Json(body): Json<SpaceIdBody>,
) -> Result<Json<bool>, ApiError> {
    spaces::delete(&app, body.space_id).await.map(Json).map_err(ApiError::from)
}

async fn spaces_list_members(
    State(app): State<Arc<AppState>>,
    Json(body): Json<SpaceIdBody>,
) -> Result<Json<Vec<spaces::StoredSpaceMember>>, ApiError> {
    spaces::list_members(&app, body.space_id).await.map(Json).map_err(ApiError::from)
}

/// `POST /api/v1/spaces_list_my_memberships` takes no arguments; we omit
/// the `Json` extractor so an empty body (or `{}`) succeeds without 415.
async fn spaces_list_my_memberships(
    State(app): State<Arc<AppState>>,
) -> Result<Json<Vec<spaces::StoredSpaceMember>>, ApiError> {
    spaces::list_my_memberships(&app).await.map(Json).map_err(ApiError::from)
}

async fn spaces_list_bots(
    State(app): State<Arc<AppState>>,
    Json(body): Json<SpaceIdBody>,
) -> Result<Json<Vec<spaces::StoredSpaceBot>>, ApiError> {
    spaces::list_bots(&app, body.space_id).await.map(Json).map_err(ApiError::from)
}

async fn spaces_join(
    State(app): State<Arc<AppState>>,
    Json(args): Json<spaces::JoinSpaceArgs>,
) -> Result<Json<spaces::JoinSpaceResult>, ApiError> {
    spaces::join(&app, args).await.map(Json).map_err(ApiError::from)
}

async fn spaces_decide_join(
    State(app): State<Arc<AppState>>,
    Json(args): Json<spaces::DecideJoinArgs>,
) -> Result<Json<spaces::DecideJoinResult>, ApiError> {
    spaces::decide_join(&app, args).await.map(Json).map_err(ApiError::from)
}

/// No-args route — see `spaces_list_my_memberships` for the empty-body
/// convention.
async fn spaces_list_join_requests(
    State(app): State<Arc<AppState>>,
) -> Result<Json<Vec<spaces::StoredJoinRequest>>, ApiError> {
    spaces::list_join_requests(&app).await.map(Json).map_err(ApiError::from)
}

async fn spaces_revoke_member(
    State(app): State<Arc<AppState>>,
    Json(args): Json<spaces::RevokeMemberArgs>,
) -> Result<Json<bool>, ApiError> {
    spaces::revoke_member(&app, args).await.map(Json).map_err(ApiError::from)
}

async fn spaces_issue_issuer_capability(
    State(app): State<Arc<AppState>>,
    Json(args): Json<spaces::IssueIssuerCapabilityArgs>,
) -> Result<Json<bool>, ApiError> {
    spaces::issue_issuer_capability(&app, args).await.map(Json).map_err(ApiError::from)
}
