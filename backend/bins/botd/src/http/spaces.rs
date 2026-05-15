use std::sync::Arc;

use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
};
use libp2p::PeerId;
use serde::Deserialize;
use soma_membership::create_space;
use soma_storage::membership::MembershipRepository;

use super::{BotState, JsonResult, auth::authorize};

#[derive(Deserialize)]
pub(super) struct CreateSpacePayload {
    admin_token: Option<String>,
    space_id: Option<String>,
    display_name: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct ListSpacesQuery {
    admin_token: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
    owner_peer_id: Option<String>,
    q: Option<String>,
    created_after: Option<i64>,
    created_before: Option<i64>,
}

pub(super) async fn create_handler(
    State(state): State<Arc<BotState>>,
    payload: Json<CreateSpacePayload>,
    admin_token: Option<String>,
) -> JsonResult {
    authorize(&admin_token, payload.admin_token.clone())?;

    let space_id = payload
        .space_id
        .clone()
        .unwrap_or_else(|| format!("space-{:016x}", rand::random::<u64>()));
    let owner_peer_id: PeerId = state.info.peer_id.parse().map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "invalid bot peer_id"})),
        )
    })?;

    create_space(
        &state.repos,
        &owner_peer_id,
        &space_id,
        payload.display_name.clone(),
    )
    .await
    .map_err(internal_error("failed to create space"))?;

    Ok(Json(serde_json::json!({
        "space_id": space_id,
        "owner_peer_id": state.info.peer_id,
    })))
}

pub(super) async fn list_handler(
    State(state): State<Arc<BotState>>,
    Query(params): Query<ListSpacesQuery>,
    admin_token: Option<String>,
) -> JsonResult {
    authorize(&admin_token, params.admin_token.clone())?;

    let limit = params.limit.unwrap_or(50).clamp(1, 200);
    let offset = params.offset.unwrap_or(0);

    let spaces = state
        .repos
        .membership()
        .list_spaces(
            params.owner_peer_id.as_deref(),
            params.q.as_deref(),
            params.created_after,
            params.created_before,
            limit,
            offset,
        )
        .await
        .map_err(internal_error("failed to list spaces"))?;

    let next_offset = (spaces.len() as u32 == limit).then_some(offset + limit);
    let spaces_json: Vec<serde_json::Value> = spaces
        .into_iter()
        .map(|s| {
            serde_json::json!({
                "space_id": s.space_id,
                "display_name": s.display_name,
                "owner_peer_id": s.owner_peer_id,
                "created_at": s.created_at,
            })
        })
        .collect();

    Ok(Json(serde_json::json!({
        "spaces": spaces_json,
        "limit": limit,
        "offset": offset,
        "next_offset": next_offset,
    })))
}

fn internal_error<E: std::fmt::Display>(
    context: &'static str,
) -> impl FnOnce(E) -> (StatusCode, Json<serde_json::Value>) {
    move |err| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": format!("{context}: {err}")})),
        )
    }
}
