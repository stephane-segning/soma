//! Space invite routes. 1:1 with `desktop_commands::invites::*`; every
//! command in that module gets a sibling `POST /api/v1/<command_name>`
//! here — see `routes/spaces.rs` for the established pattern this
//! mirrors.

use std::sync::Arc;

use axum::{Json, Router, extract::State, routing::post};
use desktop_api::{AppState, invites};
use serde::Deserialize;

use crate::error::ApiError;

pub(super) fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v1/invites_create", post(invites_create))
        .route("/api/v1/invites_list", post(invites_list))
        .route("/api/v1/invites_revoke", post(invites_revoke))
        .route("/api/v1/invites_inspect", post(invites_inspect))
        .route("/api/v1/invites_redeem", post(invites_redeem))
}

// --- Positional-arg request bodies ------------------------------------------
//
// See `routes/spaces.rs`'s matching comment: the Tauri commands take
// individual parameters, and Tauri's `invoke` wraps them into a
// `{ spaceId }`-shaped object on the wire, so we mirror that shape here
// rather than the `{ args }` wrapper used for struct-typed commands.

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpaceIdBody {
    space_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinkBody {
    link: String,
}

// --- Handlers ---------------------------------------------------------------

async fn invites_create(
    State(app): State<Arc<AppState>>,
    Json(args): Json<invites::CreateInviteArgs>,
) -> Result<Json<invites::StoredInvite>, ApiError> {
    invites::create(&app, args)
        .await
        .map(Json)
        .map_err(ApiError::from)
}

async fn invites_list(
    State(app): State<Arc<AppState>>,
    Json(body): Json<SpaceIdBody>,
) -> Result<Json<Vec<invites::StoredInvite>>, ApiError> {
    invites::list(&app, body.space_id)
        .await
        .map(Json)
        .map_err(ApiError::from)
}

async fn invites_revoke(
    State(app): State<Arc<AppState>>,
    Json(args): Json<invites::RevokeInviteArgs>,
) -> Result<Json<bool>, ApiError> {
    invites::revoke(&app, args)
        .await
        .map(Json)
        .map_err(ApiError::from)
}

async fn invites_inspect(
    State(app): State<Arc<AppState>>,
    Json(body): Json<LinkBody>,
) -> Result<Json<invites::InviteInspection>, ApiError> {
    invites::inspect(&app, body.link)
        .await
        .map(Json)
        .map_err(ApiError::from)
}

async fn invites_redeem(
    State(app): State<Arc<AppState>>,
    Json(args): Json<invites::RedeemInviteArgs>,
) -> Result<Json<invites::RedeemInviteResult>, ApiError> {
    invites::redeem(&app, args)
        .await
        .map(Json)
        .map_err(ApiError::from)
}
