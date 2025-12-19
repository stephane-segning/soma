use std::{path::PathBuf, sync::Arc};

use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    routing::{get, post},
};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use prost::Message;
use serde::Serialize;

use crate::{config::Mode, metrics::BotMetrics};
use soma_peer::join::JoinDecider;

#[derive(Debug, Clone, Serialize)]
pub struct BotInfo {
    pub peer_id: String,
    pub blob_dir: PathBuf,
}

#[derive(Clone)]
pub struct BotState {
    pub info: BotInfo,
    pub metrics: BotMetrics,
    pub join_decider: std::sync::Arc<dyn JoinDecider>,
}

pub async fn serve_http(
    http_addr: std::net::SocketAddr,
    mode: Mode,
    admin_token: Option<String>,
    state: BotState,
) -> soma_core::SomaResult<()> {
    let shared = Arc::new(state);

    let registry = shared.metrics.registry.clone();

    let mut app = Router::new()
        .route("/info", get(info_handler))
        .route("/healthz", get(|| async { "ok" }))
        .route(
            "/metrics",
            get(move || {
                let registry = registry.clone();
                async move {
                    let mut buffer = String::new();
                    prometheus_client::encoding::text::encode(&mut buffer, &registry)
                        .expect("encode metrics");
                    buffer
                }
            }),
        );

    if mode == Mode::ServerDaemon {
        let token = admin_token.clone();
        app = app.route(
            "/v1/join",
            post(move |state: State<Arc<BotState>>, body| join_handler(state, body, token.clone())),
        );
    }

    let app = app.with_state(shared);

    let listener = tokio::net::TcpListener::bind(http_addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn info_handler(State(state): State<Arc<BotState>>) -> Json<BotInfo> {
    Json(state.info.clone())
}

async fn join_handler(
    state: State<Arc<BotState>>,
    payload: Json<serde_json::Value>,
    admin_token: Option<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let payload = payload.0;

    if let Some(expected) = admin_token {
        let supplied = payload
            .get("admin_token")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        if supplied != expected {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": "unauthorized"})),
            ));
        }
    }

    let space_id = payload
        .get("space_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": "space_id is required"})),
            )
        })?
        .to_string();
    let subject_peer_id = payload
        .get("peer_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": "peer_id is required"})),
            )
        })?
        .to_string();
    let display_name = payload
        .get("display_name")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let device_name = payload
        .get("device_name")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let student_code = payload
        .get("student_code")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let requested_role = payload
        .get("requested_role")
        .and_then(|v| v.as_str())
        .unwrap_or("student")
        .to_lowercase();

    let role = match requested_role.as_str() {
        "owner" => soma_proto_build::spaceroom::SpaceRole::Owner,
        "editor" => soma_proto_build::spaceroom::SpaceRole::Editor,
        "viewer" => soma_proto_build::spaceroom::SpaceRole::Viewer,
        "bot" => soma_proto_build::spaceroom::SpaceRole::Bot,
        _ => soma_proto_build::spaceroom::SpaceRole::Student,
    };

    let issuer = state
        .info
        .peer_id
        .parse()
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "invalid bot peer_id"})),
            )
        })?;

    let req = soma_proto_build::spaceroom::JoinRequest {
        space_id: Some(soma_proto_build::spaceroom::SpaceId { value: space_id }),
        peer_id: Some(soma_proto_build::spaceroom::PeerId {
            value: subject_peer_id,
        }),
        display_name,
        device_name,
        student_code,
        requested_role: role as i32,
        invite_proof: None,
        created_at: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
    };

    let decision = state.join_decider.decide(&req, &issuer).await;
    let capability_b64 = decision
        .capability
        .as_ref()
        .map(|cap| Message::encode_to_vec(cap));
    let resp = serde_json::json!({
        "decision_id": decision.decision_id,
        "space_id": decision.space_id.as_ref().map(|s| s.value.clone()),
        "subject_peer_id": decision.subject_peer_id.as_ref().map(|p| p.value.clone()),
        "decision": decision.decision,
        "reason": decision.reason,
        "capability_b64": capability_b64.map(|bytes| B64.encode(bytes)),
    });

    Ok(Json(resp))
}
