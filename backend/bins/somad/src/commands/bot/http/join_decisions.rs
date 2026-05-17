use std::{sync::Arc, time::SystemTime};

use axum::{Json, extract::State, http::StatusCode};
use base64::Engine;
use base64::engine::general_purpose::STANDARD as B64;
use libp2p::PeerId;
use prost::Message;
use soma_membership::{decide_join_request, enqueue_outgoing_join_decision, parse_role_str};
use soma_peer::PeerCommand;
use soma_storage::mailbox::MailboxRepository;
use soma_storage::membership::MembershipRepository;

use super::{BotState, JsonResult, auth::authorize};

pub(super) async fn decide_handler(
    State(state): State<Arc<BotState>>,
    payload: Json<serde_json::Value>,
    admin_token: Option<String>,
) -> JsonResult {
    let payload = payload.0;
    authorize(
        &admin_token,
        payload
            .get("admin_token")
            .and_then(|v| v.as_str().map(|s| s.to_string())),
    )?;

    let request_id = required_str(&payload, "request_id")?.to_string();
    let approve = payload
        .get("decision")
        .and_then(|v| v.as_str())
        .map(|s| s.eq_ignore_ascii_case("approve"))
        .unwrap_or(false);
    let reason = payload
        .get("reason")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let role_override = parse_role_str(payload.get("role").and_then(|v| v.as_str()).unwrap_or(""));

    let issuer_peer_id: PeerId = state.info.peer_id.parse().map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "invalid bot peer_id"})),
        )
    })?;
    validate_join_request_target(&state, &request_id, &issuer_peer_id).await?;

    let decision = decide_join_request(
        &state.repos,
        &state.signer,
        &issuer_peer_id,
        &request_id,
        approve,
        role_override,
        reason,
    )
    .await
    .map_err(internal_error("failed to decide join"))?;

    let delivery_id = enqueue_outgoing_join_decision(&state.repos, &decision)
        .await
        .map_err(internal_error("failed to enqueue outgoing decision"))?;
    lease_delivery(&state, &delivery_id).await;
    send_decision(&state, &delivery_id, &decision).await;

    Ok(Json(serde_json::json!({
        "decision_id": decision.decision_id,
        "space_id": decision.space_id.as_ref().map(|s| s.value.clone()),
        "subject_peer_id": decision.subject_peer_id.as_ref().map(|p| p.value.clone()),
        "decision": decision.decision,
        "reason": decision.reason,
        "capability_b64": decision.capability.as_ref().map(|cap| B64.encode(Message::encode_to_vec(cap))),
        "delivery_id": delivery_id,
    })))
}

async fn validate_join_request_target(
    state: &BotState,
    request_id: &str,
    issuer_peer_id: &PeerId,
) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    if let Ok(Some(req)) = state.repos.membership().get_join_request(request_id).await {
        if req.is_outgoing {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(
                    serde_json::json!({"error": "cannot decide outgoing (self-initiated) join request"}),
                ),
            ));
        }
        let issuer = issuer_peer_id.to_string();
        if req
            .target_peer_id
            .as_deref()
            .is_some_and(|target| target != issuer.as_str())
        {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": "join request not addressed to this peer"})),
            ));
        }
    }
    Ok(())
}

async fn lease_delivery(state: &BotState, delivery_id: &str) {
    let now_secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let _ = state
        .repos
        .mailbox()
        .lease(delivery_id, &state.peer_id.to_string(), now_secs + 30)
        .await;
}

async fn send_decision(
    state: &BotState,
    delivery_id: &str,
    decision: &soma_proto_build::space::JoinDecision,
) {
    if let Some(target) = decision
        .subject_peer_id
        .as_ref()
        .and_then(|p| p.value.parse::<PeerId>().ok())
    {
        let _ = state
            .peer_commands
            .send(PeerCommand::SendJoinDecision {
                target,
                addrs: Vec::new(),
                delivery_id: delivery_id.to_string(),
                decision: decision.clone(),
            })
            .await;
    }
}

fn required_str<'a>(
    payload: &'a serde_json::Value,
    field: &str,
) -> Result<&'a str, (StatusCode, Json<serde_json::Value>)> {
    payload.get(field).and_then(|v| v.as_str()).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": format!("{field} is required")})),
        )
    })
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
