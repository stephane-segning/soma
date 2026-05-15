use std::{sync::Arc, time::SystemTime};

use axum::{Json, extract::State, http::StatusCode};
use base64::Engine;
use base64::engine::general_purpose::STANDARD as B64;
use libp2p::PeerId;
use prost::Message;
use serde::Deserialize;
use soma_membership::{issue_issuer_capability_to_storage, parse_role_str};
use soma_proto_build::space::SpaceRole;
use soma_storage::issuer::IssuerRepository;

use super::{BotState, JsonResult, auth::authorize};

#[derive(Deserialize)]
pub(super) struct IssueIssuerCapPayload {
    admin_token: Option<String>,
    space_id: String,
    delegate_peer_id: String,
    allowed_roles: Option<Vec<String>>,
    expires_at_secs: Option<i64>,
}

#[derive(Deserialize)]
pub(super) struct ImportIssuerCapPayload {
    admin_token: Option<String>,
    space_id: String,
    delegate_peer_id: String,
    issuer_peer_id: String,
    expires_at_secs: Option<i64>,
    capability_b64: String,
}

pub(super) async fn issue_handler(
    State(state): State<Arc<BotState>>,
    payload: Json<IssueIssuerCapPayload>,
    admin_token: Option<String>,
) -> JsonResult {
    authorize(&admin_token, payload.admin_token.clone())?;

    let owner_peer_id = parse_peer_id(
        &state.info.peer_id,
        StatusCode::INTERNAL_SERVER_ERROR,
        "invalid bot peer_id",
    )?;
    let delegate_peer_id = parse_peer_id(
        &payload.delegate_peer_id,
        StatusCode::BAD_REQUEST,
        "invalid delegate_peer_id",
    )?;
    let allowed_roles: Vec<SpaceRole> = payload
        .allowed_roles
        .clone()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|s| parse_role_str(&s))
        .collect();

    let issuer_cap = issue_issuer_capability_to_storage(
        &state.repos,
        &state.signer,
        &owner_peer_id,
        &payload.space_id,
        &delegate_peer_id,
        allowed_roles,
        payload.expires_at_secs,
    )
    .await
    .map_err(internal_error("failed to issue issuer capability"))?;

    Ok(Json(serde_json::json!({
        "space_id": payload.space_id,
        "delegate_peer_id": payload.delegate_peer_id,
        "capability_b64": B64.encode(Message::encode_to_vec(&issuer_cap)),
    })))
}

pub(super) async fn import_handler(
    State(state): State<Arc<BotState>>,
    payload: Json<ImportIssuerCapPayload>,
    admin_token: Option<String>,
) -> JsonResult {
    authorize(&admin_token, payload.admin_token.clone())?;

    let bytes = B64.decode(payload.capability_b64.as_bytes()).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "invalid capability_b64"})),
        )
    })?;

    state
        .repos
        .issuer()
        .upsert(&soma_storage::issuer::IssuerCapability {
            space_id: payload.space_id.clone(),
            issuer_peer_id: payload.issuer_peer_id.clone(),
            delegate_peer_id: payload.delegate_peer_id.clone(),
            issued_at: now_secs(),
            expires_at: payload.expires_at_secs,
            capability: Some(bytes),
        })
        .await
        .map_err(internal_error("failed to import issuer capability"))?;

    Ok(Json(serde_json::json!({"ok": true})))
}

fn parse_peer_id(
    value: &str,
    status: StatusCode,
    error: &'static str,
) -> Result<PeerId, (StatusCode, Json<serde_json::Value>)> {
    value.parse().map_err(|_| {
        (
            status,
            Json(serde_json::json!({"error": error})),
        )
    })
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
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
