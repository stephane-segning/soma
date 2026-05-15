use std::{sync::Arc, time::SystemTime};

use axum::{Json, extract::State, http::StatusCode};
use libp2p::PeerId;
use serde::Deserialize;
use soma_membership::{enqueue_outgoing_join_request, parse_role_str};
use soma_peer::PeerCommand;
use soma_proto_build::space::SpaceRole;
use soma_storage::RepositoryFactory;
use soma_storage::mailbox::MailboxRepository;
use soma_storage::membership::MembershipRepository;

use super::{BotState, JsonResult, auth::authorize};

#[derive(Deserialize)]
pub(super) struct JoinRequestSubmitPayload {
    admin_token: Option<String>,
    space_id: String,
    target_peer_id: String,
    target_multiaddrs: Vec<String>,
    display_name: Option<String>,
    device_name: Option<String>,
    requested_role: Option<String>,
}

pub(super) async fn submit_handler(
    State(state): State<Arc<BotState>>,
    payload: Json<JoinRequestSubmitPayload>,
    admin_token: Option<String>,
) -> JsonResult {
    authorize(&admin_token, payload.admin_token.clone())?;

    let target_peer_id: PeerId = payload.target_peer_id.parse().map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "invalid target_peer_id"})),
        )
    })?;
    let addrs = parse_multiaddrs(&payload.target_multiaddrs)?;
    let requested_role = payload
        .requested_role
        .as_deref()
        .unwrap_or("member")
        .to_lowercase();
    let role = parse_role_str(&requested_role).unwrap_or(SpaceRole::Member);

    let request_id = format!("req-{:016x}", rand::random::<u64>());
    let join_request = soma_proto_build::space::JoinRequest {
        space_id: Some(soma_proto_build::space::SpaceId {
            value: payload.space_id.clone(),
        }),
        peer_id: Some(soma_proto_build::space::PeerId {
            value: state.info.peer_id.clone(),
        }),
        display_name: payload.display_name.clone().unwrap_or_default(),
        device_name: payload.device_name.clone().unwrap_or_default(),
        requester_code: String::new(),
        requested_role: role as i32,
        invite_proof: None,
        created_at: Some(prost_types::Timestamp::from(SystemTime::now())),
    };

    let delivery_id = enqueue_outgoing_join_request(
        &state.repos,
        &target_peer_id,
        &request_id,
        &addrs,
        &join_request,
    )
    .await
    .map_err(internal_error("failed to enqueue join request"))?;

    record_outgoing_join_request(
        &state.repos,
        &request_id,
        &payload.space_id,
        &state.info.peer_id,
        &target_peer_id.to_string(),
        role as i32,
    )
    .await;
    lease_delivery(&state, &delivery_id).await;

    state
        .peer_commands
        .send(PeerCommand::SendJoinRequest {
            target: target_peer_id,
            addrs,
            delivery_id: delivery_id.clone(),
            request_id: request_id.clone(),
            request: join_request,
        })
        .await
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "peer task is not running"})),
            )
        })?;

    Ok(Json(
        serde_json::json!({ "request_id": request_id, "delivery_id": delivery_id }),
    ))
}

fn parse_multiaddrs(
    values: &[String],
) -> Result<Vec<libp2p::Multiaddr>, (StatusCode, Json<serde_json::Value>)> {
    let mut addrs = Vec::new();
    for addr in values {
        let parsed = addr.parse().map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": "invalid multiaddr in target_multiaddrs"})),
            )
        })?;
        addrs.push(parsed);
    }
    if addrs.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "target_multiaddrs is required"})),
        ));
    }
    Ok(addrs)
}

async fn record_outgoing_join_request(
    repos: &RepositoryFactory,
    request_id: &str,
    space_id: &str,
    subject_peer_id: &str,
    target_peer_id: &str,
    requested_role: i32,
) {
    let now_secs = now_secs();

    let _ = repos
        .membership()
        .upsert_join_request(&soma_storage::membership::JoinRequest {
            request_id: request_id.to_string(),
            space_id: space_id.to_string(),
            subject_peer_id: subject_peer_id.to_string(),
            display_name: String::new(),
            device_name: String::new(),
            requested_role,
            created_at: now_secs,
            payload: None,
            target_peer_id: Some(target_peer_id.to_string()),
            status: "pending".into(),
            attempts: 0,
            next_attempt_at: 0,
            last_error: None,
            is_outgoing: true,
        })
        .await;
}

async fn lease_delivery(state: &BotState, delivery_id: &str) {
    let _ = state
        .repos
        .mailbox()
        .lease(delivery_id, &state.peer_id.to_string(), now_secs() + 30)
        .await;
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
