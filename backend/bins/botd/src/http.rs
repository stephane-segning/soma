use std::{path::PathBuf, sync::Arc};

use axum::{
    Json, Router,
    extract::{Query, State},
    http::StatusCode,
    routing::{get, post},
};
use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use libp2p::PeerId;
use prost::Message;
use serde::{Deserialize, Serialize};
use std::time::SystemTime;
use crate::join::{epoch_seconds, persist_membership, role_to_str};
use soma_common::sign_membership_capability;
use soma_proto_build::spaceroom::{JoinDecision, JoinDecisionType, MembershipCapability, SpaceId, SpaceRole};
use soma_storage::membership::{JoinDecision as StoredDecision, MembershipRepository};
use tracing::warn;
use prost_types::Timestamp;

use crate::{config::Mode, metrics::BotMetrics};
use libp2p::identity::Keypair;
use soma_storage::RepositoryFactory;
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
    pub repos: RepositoryFactory,
    pub signer: Keypair,
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
        let token_requests = admin_token.clone();
        let token_decide = admin_token.clone();
        app = app.route(
            "/v1/join",
            post(move |state: State<Arc<BotState>>, body| join_handler(state, body, token.clone())),
        )
        .route(
            "/v1/join/requests",
            get(move |state: State<Arc<BotState>>, query| {
                join_requests_handler(state, query, token_requests.clone())
            }),
        )
        .route(
            "/v1/join/decide",
            post(move |state: State<Arc<BotState>>, body| {
                join_decide_handler(state, body, token_decide.clone())
            }),
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

    authorize(&admin_token, payload.get("admin_token").and_then(|v| v.as_str().map(|s| s.to_string())))?;

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

#[derive(Deserialize)]
struct AdminTokenParam {
    admin_token: Option<String>,
}

fn authorize(
    expected: &Option<String>,
    supplied: Option<String>,
) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    if let Some(expected) = expected {
        if supplied.as_deref().unwrap_or_default() != expected {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": "unauthorized"})),
            ));
        }
    }
    Ok(())
}

async fn join_requests_handler(
    State(state): State<Arc<BotState>>,
    Query(params): Query<AdminTokenParam>,
    admin_token: Option<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    authorize(&admin_token, params.admin_token.clone())?;

    let rows = state
        .repos
        .membership()
        .list_join_requests()
        .await
        .map_err(|err| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("failed to list join requests: {err}") })),
            )
        })?;

    let requests: Vec<serde_json::Value> = rows
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
            })
        })
        .collect();

    Ok(Json(serde_json::json!({ "requests": requests })))
}

async fn join_decide_handler(
    State(state): State<Arc<BotState>>,
    payload: Json<serde_json::Value>,
    admin_token: Option<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let payload = payload.0;
    authorize(
        &admin_token,
        payload
            .get("admin_token")
            .and_then(|v| v.as_str().map(|s| s.to_string())),
    )?;

    let request_id = payload
        .get("request_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": "request_id is required"})),
            )
        })?
        .to_string();

    let approve = payload
        .get("decision")
        .and_then(|v| v.as_str())
        .map(|s| s.eq_ignore_ascii_case("approve"))
        .unwrap_or(false);
    let reason = payload
        .get("reason")
        .and_then(|v| v.as_str())
        .unwrap_or("manual decision")
        .to_string();

    let repo = state.repos.membership();
    let req = repo
        .get_join_request(&request_id)
        .await
        .map_err(|err| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("failed to load join request: {err}")})),
            )
        })?
        .ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "request not found"})),
            )
        })?;

    let role_str = payload
        .get("role")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let requested_role = parse_role(role_str).unwrap_or_else(|| req.requested_role);

    let role_enum = SpaceRole::try_from(requested_role).unwrap_or(SpaceRole::Student);
    let now_secs = epoch_seconds(SystemTime::now());
    let now_ts = Timestamp::from(SystemTime::now());
    let issuer_peer_id: PeerId = state
        .info
        .peer_id
        .parse()
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "invalid bot peer_id"})),
            )
        })?;

    let mut membership_cap = MembershipCapability {
        space_id: Some(SpaceId {
            value: req.space_id.clone(),
        }),
        subject_peer_id: Some(soma_proto_build::spaceroom::PeerId {
            value: req.subject_peer_id.clone(),
        }),
        role: role_enum as i32,
        permissions: Vec::new(),
        issued_at: Some(now_ts.clone()),
        expires_at: None,
        issuer_peer_id: Some(soma_proto_build::spaceroom::PeerId {
            value: issuer_peer_id.to_string(),
        }),
        issuer_cap: None,
        signed: None,
    };

    if approve {
        if let Err(err) = sign_membership_capability(&mut membership_cap, &state.signer) {
            warn!(%err, "failed to sign membership capability");
        }
    }

    let decision = JoinDecision {
        decision_id: format!("join-{:016x}", rand::random::<u64>()),
        space_id: Some(SpaceId {
            value: req.space_id.clone(),
        }),
        subject_peer_id: Some(soma_proto_build::spaceroom::PeerId {
            value: req.subject_peer_id.clone(),
        }),
        decision: if approve {
            JoinDecisionType::JoinApproved as i32
        } else {
            JoinDecisionType::JoinRejected as i32
        },
        reason: reason.clone(),
        capability: if approve {
            Some(membership_cap.clone())
        } else {
            None
        },
        created_at: Some(now_ts.clone()),
    };

    if approve {
        let role_str = role_to_str(role_enum);
        let cap_bytes = membership_cap.encode_to_vec();
        persist_membership(
            &repo,
            &req.space_id,
            &req.subject_peer_id,
            &issuer_peer_id,
            role_str,
            now_secs,
            cap_bytes.clone(),
        )
        .await;

        let _ = repo
            .record_join_decision(&StoredDecision {
                decision_id: decision.decision_id.clone(),
                space_id: req.space_id.clone(),
                subject_peer_id: req.subject_peer_id.clone(),
                decision: decision.decision,
                reason: Some(reason.clone()),
                created_at: now_secs,
                capability: Some(cap_bytes),
            })
            .await;
    } else {
        let _ = repo
            .record_join_decision(&StoredDecision {
                decision_id: decision.decision_id.clone(),
                space_id: req.space_id.clone(),
                subject_peer_id: req.subject_peer_id.clone(),
                decision: decision.decision,
                reason: Some(reason.clone()),
                created_at: now_secs,
                capability: None,
            })
            .await;
    }

    let _ = repo.delete_join_request(&request_id).await;

    let capability_b64 = decision
        .capability
        .as_ref()
        .map(|cap| B64.encode(Message::encode_to_vec(cap)));

    let resp = serde_json::json!({
        "decision_id": decision.decision_id,
        "space_id": decision.space_id.as_ref().map(|s| s.value.clone()),
        "subject_peer_id": decision.subject_peer_id.as_ref().map(|p| p.value.clone()),
        "decision": decision.decision,
        "reason": decision.reason,
        "capability_b64": capability_b64,
    });

    Ok(Json(resp))
}

fn parse_role(role: &str) -> Option<i32> {
    match role.to_lowercase().as_str() {
        "owner" => Some(SpaceRole::Owner as i32),
        "editor" => Some(SpaceRole::Editor as i32),
        "viewer" => Some(SpaceRole::Viewer as i32),
        "bot" => Some(SpaceRole::Bot as i32),
        "student" => Some(SpaceRole::Student as i32),
        _ => None,
    }
}
