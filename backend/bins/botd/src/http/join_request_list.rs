use std::sync::Arc;

use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
};
use serde::Deserialize;
use soma_storage::membership::MembershipRepository;

use super::{BotState, JsonResult, auth::authorize};

#[derive(Deserialize)]
pub(super) struct JoinRequestsQuery {
    admin_token: Option<String>,
    target_peer_id: Option<String>,
    outgoing: Option<bool>,
    limit: Option<u32>,
    offset: Option<u32>,
}

pub(super) async fn list_handler(
    State(state): State<Arc<BotState>>,
    Query(params): Query<JoinRequestsQuery>,
    admin_token: Option<String>,
) -> JsonResult {
    authorize(&admin_token, params.admin_token.clone())?;

    let filtered = state
        .repos
        .membership()
        .list_join_requests_filtered(
            params.target_peer_id.as_deref(),
            params.outgoing,
            params.limit,
            params.offset,
        )
        .await
        .map_err(internal_error("failed to list join requests"))?;

    let combined: Vec<serde_json::Value> = filtered
        .into_iter()
        .map(|r| {
            serde_json::json!({
                "request_id": r.request_id,
                "space_id": r.space_id,
                "subject_peer_id": r.subject_peer_id,
                "display_name": r.display_name,
                "device_name": r.device_name,
                "requested_role": r.requested_role,
                "created_at": r.created_at,
                "target_peer_id": r.target_peer_id,
                "status": r.status,
                "attempts": r.attempts,
                "next_attempt_at": r.next_attempt_at,
                "last_error": r.last_error,
                "outbox": r.is_outgoing,
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "requests": combined })))
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
