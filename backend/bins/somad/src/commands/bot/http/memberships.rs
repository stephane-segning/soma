use std::sync::Arc;

use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
};
use base64::Engine;
use base64::engine::general_purpose::STANDARD as B64;
use serde::Deserialize;
use soma_storage::membership::MembershipRepository;

use super::{BotState, JsonResult, auth::authorize};

#[derive(Deserialize)]
pub(super) struct ListSpaceMembersQuery {
    admin_token: Option<String>,
    space_id: String,
}

#[derive(Deserialize)]
pub(super) struct ListMyMembershipsQuery {
    admin_token: Option<String>,
    peer_id: Option<String>,
}

pub(super) async fn list_space_members_handler(
    State(state): State<Arc<BotState>>,
    Query(params): Query<ListSpaceMembersQuery>,
    admin_token: Option<String>,
) -> JsonResult {
    authorize(&admin_token, params.admin_token.clone())?;

    let rows = state
        .repos
        .membership()
        .list_memberships(&params.space_id)
        .await
        .map_err(internal_error("failed to list members"))?;

    let members: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|m| {
            serde_json::json!({
                "space_id": m.space_id,
                "subject_peer_id": m.subject_peer_id,
                "role": m.role,
                "issuer_peer_id": m.issuer_peer_id,
                "issued_at": m.issued_at,
                "expires_at": m.expires_at,
                "capability_b64": m.capability.map(|b| B64.encode(b)),
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "members": members })))
}

pub(super) async fn list_my_memberships_handler(
    State(state): State<Arc<BotState>>,
    Query(params): Query<ListMyMembershipsQuery>,
    admin_token: Option<String>,
) -> JsonResult {
    authorize(&admin_token, params.admin_token.clone())?;

    let peer_id = params
        .peer_id
        .as_deref()
        .unwrap_or(&state.info.peer_id)
        .to_string();

    let rows = state
        .repos
        .membership()
        .list_memberships_by_subject(&peer_id)
        .await
        .map_err(internal_error("failed to list memberships"))?;

    let memberships: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|m| {
            serde_json::json!({
                "space_id": m.space_id,
                "subject_peer_id": m.subject_peer_id,
                "role": m.role,
                "issuer_peer_id": m.issuer_peer_id,
                "issued_at": m.issued_at,
                "expires_at": m.expires_at,
                "capability_b64": m.capability.map(|b| B64.encode(b)),
                "outbox": false,
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "memberships": memberships })))
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
