use std::{path::PathBuf, sync::Arc, time::SystemTime};

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
use soma_membership::{
    create_space, decide_join_request, enqueue_outgoing_join_decision, enqueue_outgoing_join_request,
    issue_issuer_capability_to_storage, parse_role_str,
};
use soma_proto_build::spaceroom::SpaceRole;
use soma_storage::issuer::IssuerRepository;
use soma_storage::membership::MembershipRepository;

use crate::{config::Mode, metrics::BotMetrics};
use libp2p::identity::Keypair;
use soma_storage::RepositoryFactory;
use soma_peer::PeerCommand;
use tokio::sync::mpsc;
use soma_storage::mailbox::MailboxRepository;

#[derive(Debug, Clone, Serialize)]
pub struct BotInfo {
    pub peer_id: String,
    pub blob_dir: PathBuf,
}

#[derive(Clone)]
pub struct BotState {
    pub info: BotInfo,
    pub peer_id: PeerId,
    pub metrics: BotMetrics,
    pub repos: RepositoryFactory,
    pub signer: Keypair,
    pub peer_commands: mpsc::Sender<PeerCommand>,
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
        let token_join_request = admin_token.clone();
        let token_create_space = admin_token.clone();
        let token_list_spaces = admin_token.clone();
        let token_issue_issuer = admin_token.clone();
        let token_import_issuer = admin_token.clone();
        let token_requests = admin_token.clone();
        let token_decide = admin_token.clone();
        let token_members = admin_token.clone();
        let token_my_memberships = admin_token.clone();

        app = app.route(
            "/v1/join/request",
            post(move |state: State<Arc<BotState>>, body| {
                join_request_submit_handler(state, body, token_join_request.clone())
            }),
        )
        .route(
            "/v1/spaces",
            post(move |state: State<Arc<BotState>>, body| {
                create_space_handler(state, body, token_create_space.clone())
            }),
        )
        .route(
            "/v1/spaces",
            get(move |state: State<Arc<BotState>>, query| {
                list_spaces_handler(state, query, token_list_spaces.clone())
            }),
        )
        .route(
            "/v1/spaces/issuer-capability/issue",
            post(move |state: State<Arc<BotState>>, body| {
                issue_issuer_capability_handler(state, body, token_issue_issuer.clone())
            }),
        )
        .route(
            "/v1/spaces/issuer-capability/import",
            post(move |state: State<Arc<BotState>>, body| {
                import_issuer_capability_handler(state, body, token_import_issuer.clone())
            }),
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
        )
        .route(
            "/v1/space/members",
            get(move |state: State<Arc<BotState>>, query| {
                list_space_members_handler(state, query, token_members.clone())
            }),
        )
        .route(
            "/v1/memberships",
            get(move |state: State<Arc<BotState>>, query| {
                list_my_memberships_handler(state, query, token_my_memberships.clone())
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

#[derive(Deserialize)]
struct JoinRequestSubmitPayload {
    admin_token: Option<String>,
    space_id: String,
    target_peer_id: String,
    target_multiaddrs: Vec<String>,
    display_name: Option<String>,
    device_name: Option<String>,
    requested_role: Option<String>,
}

async fn join_request_submit_handler(
    State(state): State<Arc<BotState>>,
    payload: Json<JoinRequestSubmitPayload>,
    admin_token: Option<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    authorize(&admin_token, payload.admin_token.clone())?;

    let target_peer_id: PeerId = payload.target_peer_id.parse().map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "invalid target_peer_id"})),
        )
    })?;

    let mut addrs = Vec::new();
    for addr in &payload.target_multiaddrs {
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

    let requested_role = payload
        .requested_role
        .as_deref()
        .unwrap_or("student")
        .to_lowercase();
    let role = parse_role_str(&requested_role).unwrap_or(SpaceRole::Student);

    let request_id = format!("req-{:016x}", rand::random::<u64>());
    let join_request = soma_proto_build::spaceroom::JoinRequest {
        space_id: Some(soma_proto_build::spaceroom::SpaceId {
            value: payload.space_id.clone(),
        }),
        peer_id: Some(soma_proto_build::spaceroom::PeerId {
            value: state.info.peer_id.clone(),
        }),
        display_name: payload.display_name.clone().unwrap_or_default(),
        device_name: payload.device_name.clone().unwrap_or_default(),
        student_code: String::new(),
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
    .map_err(|err| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": format!("failed to enqueue join request: {err}")})),
        )
    })?;

    // Track in join_requests table as outgoing.
    record_outgoing_join_request(
        &state.repos,
        &request_id,
        &payload.space_id,
        &state.info.peer_id,
        &target_peer_id.to_string(),
        role as i32,
    )
    .await;

    let now_secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let _ = state
        .repos
        .mailbox()
        .lease(&delivery_id, &state.peer_id.to_string(), now_secs + 30)
        .await;

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

    Ok(Json(serde_json::json!({ "request_id": request_id, "delivery_id": delivery_id })))
}

async fn record_outgoing_join_request(
    repos: &RepositoryFactory,
    request_id: &str,
    space_id: &str,
    subject_peer_id: &str,
    target_peer_id: &str,
    requested_role: i32,
) {
    let now_secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

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

#[derive(Deserialize)]
struct CreateSpacePayload {
    admin_token: Option<String>,
    space_id: Option<String>,
    display_name: Option<String>,
}

async fn create_space_handler(
    State(state): State<Arc<BotState>>,
    payload: Json<CreateSpacePayload>,
    admin_token: Option<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
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
    .map_err(|err| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": format!("failed to create space: {err}")})),
        )
    })?;

    Ok(Json(serde_json::json!({
        "space_id": space_id,
        "owner_peer_id": state.info.peer_id,
    })))
}

#[derive(Deserialize)]
struct ListSpacesQuery {
    admin_token: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
    owner_peer_id: Option<String>,
    q: Option<String>,
    created_after: Option<i64>,
    created_before: Option<i64>,
}

async fn list_spaces_handler(
    State(state): State<Arc<BotState>>,
    Query(params): Query<ListSpacesQuery>,
    admin_token: Option<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    authorize(&admin_token, params.admin_token.clone())?;

    let limit = params.limit.unwrap_or(50).min(200).max(1);
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
        .map_err(|err| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("failed to list spaces: {err}")})),
            )
        })?;

    let next_offset = if spaces.len() as u32 == limit {
        Some(offset + limit)
    } else {
        None
    };

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

#[derive(Deserialize)]
struct IssueIssuerCapPayload {
    admin_token: Option<String>,
    space_id: String,
    delegate_peer_id: String,
    allowed_roles: Option<Vec<String>>,
    expires_at_secs: Option<i64>,
}

async fn issue_issuer_capability_handler(
    State(state): State<Arc<BotState>>,
    payload: Json<IssueIssuerCapPayload>,
    admin_token: Option<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    authorize(&admin_token, payload.admin_token.clone())?;

    let owner_peer_id: PeerId = state.info.peer_id.parse().map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "invalid bot peer_id"})),
        )
    })?;
    let delegate_peer_id: PeerId = payload.delegate_peer_id.parse().map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "invalid delegate_peer_id"})),
        )
    })?;

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
    .map_err(|err| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": format!("failed to issue issuer capability: {err}")})),
        )
    })?;

    let bytes = Message::encode_to_vec(&issuer_cap);

    Ok(Json(serde_json::json!({
        "space_id": payload.space_id,
        "delegate_peer_id": payload.delegate_peer_id,
        "capability_b64": B64.encode(bytes),
    })))
}

#[derive(Deserialize)]
struct ImportIssuerCapPayload {
    admin_token: Option<String>,
    space_id: String,
    delegate_peer_id: String,
    issuer_peer_id: String,
    expires_at_secs: Option<i64>,
    capability_b64: String,
}

async fn import_issuer_capability_handler(
    State(state): State<Arc<BotState>>,
    payload: Json<ImportIssuerCapPayload>,
    admin_token: Option<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    authorize(&admin_token, payload.admin_token.clone())?;

    let bytes = B64.decode(payload.capability_b64.as_bytes()).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "invalid capability_b64"})),
        )
    })?;

    let now_secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    state
        .repos
        .issuer()
        .upsert(&soma_storage::issuer::IssuerCapability {
            space_id: payload.space_id.clone(),
            issuer_peer_id: payload.issuer_peer_id.clone(),
            delegate_peer_id: payload.delegate_peer_id.clone(),
            issued_at: now_secs,
            expires_at: payload.expires_at_secs,
            capability: Some(bytes),
        })
        .await
        .map_err(|err| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("failed to import issuer capability: {err}")})),
            )
        })?;

    Ok(Json(serde_json::json!({"ok": true})))
}

#[derive(Deserialize)]
struct ListSpaceMembersQuery {
    admin_token: Option<String>,
    space_id: String,
}

#[derive(Deserialize)]
struct ListMyMembershipsQuery {
    admin_token: Option<String>,
    peer_id: Option<String>,
}

async fn list_space_members_handler(
    State(state): State<Arc<BotState>>,
    Query(params): Query<ListSpaceMembersQuery>,
    admin_token: Option<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    authorize(&admin_token, params.admin_token.clone())?;

    let rows = state
        .repos
        .membership()
        .list_memberships(&params.space_id)
        .await
        .map_err(|err| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("failed to list members: {err}")})),
            )
        })?;

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

async fn list_my_memberships_handler(
    State(state): State<Arc<BotState>>,
    Query(params): Query<ListMyMembershipsQuery>,
    admin_token: Option<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
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
        .map_err(|err| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("failed to list memberships: {err}")})),
            )
        })?;

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

#[derive(Deserialize)]
struct JoinRequestsQuery {
    admin_token: Option<String>,
    target_peer_id: Option<String>,
    outgoing: Option<bool>,
    limit: Option<u32>,
    offset: Option<u32>,
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
    Query(params): Query<JoinRequestsQuery>,
    admin_token: Option<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
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
        .map_err(|err| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("failed to list join requests: {err}")})),
            )
        })?;

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
        .map(|s| s.to_string());

    let role_str = payload
        .get("role")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let role_override = parse_role_str(role_str);

    let issuer_peer_id: PeerId = state.info.peer_id.parse().map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "invalid bot peer_id"})),
        )
    })?;

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
    .map_err(|err| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": format!("failed to decide join: {err}")})),
        )
    })?;

    let delivery_id = enqueue_outgoing_join_decision(&state.repos, &decision)
        .await
        .map_err(|err| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("failed to enqueue outgoing decision: {err}")})),
            )
        })?;

    let now_secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let _ = state
        .repos
        .mailbox()
        .lease(&delivery_id, &state.peer_id.to_string(), now_secs + 30)
        .await;

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
                delivery_id: delivery_id.clone(),
                decision: decision.clone(),
            })
            .await;
    }

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
        "delivery_id": delivery_id,
    });

    Ok(Json(resp))
}
