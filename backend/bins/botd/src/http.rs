use std::{sync::Arc, time::{Duration, SystemTime}, path::PathBuf};

use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    routing::{get, post},
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use prost::Message;
use prost_types::Timestamp;
use serde::{Deserialize, Serialize};
use soma_proto_build::classroom::v1::{
    ClassId, ClassRole, JoinDecision, JoinDecisionType, MembershipCapability, PeerId,
};
use tracing::info;

use crate::metrics::{BotMetrics, JoinDecisionLabels};

#[derive(Debug, Clone, Serialize)]
pub struct BotInfo {
    pub peer_id: String,
    pub blob_dir: PathBuf,
}

#[derive(Clone)]
pub struct BotState {
    pub info: BotInfo,
    pub issuer_peer_id: String,
    pub metrics: BotMetrics,
}

#[derive(Debug, Deserialize)]
pub struct JoinDecisionRequest {
    pub class_id: String,
    pub subject_peer_id: String,
    #[serde(default = "default_approve")]
    pub approve: bool,
    /// Optional override; defaults to STUDENT.
    pub role: Option<String>,
    /// Expiry for capability in seconds (defaults to 1 day).
    pub expires_in_secs: Option<u64>,
    /// Human-facing context kept in logs/metrics.
    pub display_name: Option<String>,
    pub device_name: Option<String>,
    pub student_code: Option<String>,
    pub reason: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MembershipCapabilityView {
    pub class_id: String,
    pub subject_peer_id: String,
    pub issuer_peer_id: String,
    pub role: String,
    pub issued_at: i64,
    pub expires_at: i64,
    pub encoded: String,
}

#[derive(Debug, Serialize)]
pub struct JoinDecisionView {
    pub decision_id: String,
    pub decision: String,
    pub class_id: String,
    pub subject_peer_id: String,
    pub reason: String,
    pub created_at: i64,
    pub decision_encoded: String,
    pub capability: Option<MembershipCapabilityView>,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

fn default_approve() -> bool {
    true
}

pub async fn serve_http(http_addr: std::net::SocketAddr, state: BotState) -> soma_core::SomaResult<()> {
    let shared = Arc::new(state);

    let registry = shared.metrics.registry.clone();

    let app = Router::new()
        .route("/info", get(info_handler))
        .route("/v1/join", post(join_handler))
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
        )
        .with_state(shared);

    let listener = tokio::net::TcpListener::bind(http_addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn info_handler(State(state): State<Arc<BotState>>) -> Json<BotInfo> {
    Json(state.info.clone())
}

async fn join_handler(
    State(state): State<Arc<BotState>>,
    Json(payload): Json<JoinDecisionRequest>,
) -> Result<Json<JoinDecisionView>, (StatusCode, Json<ErrorResponse>)> {
    let class_id = payload.class_id.trim();
    let subject = payload.subject_peer_id.trim();
    if class_id.is_empty() || subject.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "class_id and subject_peer_id are required".into(),
            }),
        ));
    }

    info!(
        %class_id,
        %subject,
        approve = payload.approve,
        display_name = ?payload.display_name,
        device_name = ?payload.device_name,
        student_code = ?payload.student_code,
        "join decision requested"
    );

    let issued_at = SystemTime::now();
    let expires_at = issued_at + Duration::from_secs(payload.expires_in_secs.unwrap_or(86_400));
    let decision_id = format!("{:016x}", rand::random::<u64>());

    let role = parse_role(payload.role.as_deref());
    let (decision_type, reason, capability) = if payload.approve {
        let capability = MembershipCapability {
            class_id: Some(ClassId {
                value: class_id.to_string(),
            }),
            subject_peer_id: Some(PeerId {
                value: subject.to_string(),
            }),
            role: role as i32,
            permissions: vec![],
            issued_at: Some(Timestamp::from(issued_at)),
            expires_at: Some(Timestamp::from(expires_at)),
            issuer_peer_id: Some(PeerId {
                value: state.issuer_peer_id.clone(),
            }),
            issuer_cap: None,
            signed: None,
        };
        (
            JoinDecisionType::JoinApproved,
            payload
                .reason
                .unwrap_or_else(|| "approved by soma-botd".into()),
            Some(capability),
        )
    } else {
        (
            JoinDecisionType::JoinRejected,
            payload
                .reason
                .unwrap_or_else(|| "rejected by soma-botd".into()),
            None,
        )
    };

    let decision = JoinDecision {
        decision_id: decision_id.clone(),
        class_id: Some(ClassId {
            value: class_id.to_string(),
        }),
        subject_peer_id: Some(PeerId {
            value: subject.to_string(),
        }),
        decision: decision_type as i32,
        reason: reason.clone(),
        capability,
        created_at: Some(Timestamp::from(issued_at)),
    };

    let decision_view = JoinDecisionView {
        decision_id,
        decision: decision_type.as_str_name().to_string(),
        class_id: class_id.to_string(),
        subject_peer_id: subject.to_string(),
        reason,
        created_at: issued_at
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or_default(),
        decision_encoded: BASE64.encode(decision.encode_to_vec()),
        capability: decision.capability.as_ref().map(capability_to_view),
    };

    let outcome = if payload.approve { "approved" } else { "rejected" };
    state
        .metrics
        .join_decisions
        .get_or_create(&JoinDecisionLabels { outcome })
        .inc();

    Ok(Json(decision_view))
}

fn parse_role(input: Option<&str>) -> ClassRole {
    match input.map(|s| s.to_ascii_lowercase()) {
        Some(ref s) if s.contains("owner") => ClassRole::Owner,
        Some(ref s) if s.contains("editor") => ClassRole::Editor,
        Some(ref s) if s.contains("viewer") => ClassRole::Viewer,
        Some(ref s) if s.contains("bot") => ClassRole::Bot,
        Some(ref s) if s.contains("teacher") => ClassRole::Owner,
        _ => ClassRole::Student,
    }
}

fn capability_to_view(capability: &MembershipCapability) -> MembershipCapabilityView {
    let issued_at = capability
        .issued_at
        .as_ref()
        .map(|ts| ts.seconds)
        .unwrap_or_default();
    let expires_at = capability
        .expires_at
        .as_ref()
        .map(|ts| ts.seconds)
        .unwrap_or_default();

    MembershipCapabilityView {
        class_id: capability
            .class_id
            .as_ref()
            .map(|c| c.value.clone())
            .unwrap_or_default(),
        subject_peer_id: capability
            .subject_peer_id
            .as_ref()
            .map(|p| p.value.clone())
            .unwrap_or_default(),
        issuer_peer_id: capability
            .issuer_peer_id
            .as_ref()
            .map(|p| p.value.clone())
            .unwrap_or_default(),
        role: ClassRole::try_from(capability.role)
            .unwrap_or(ClassRole::Unspecified)
            .as_str_name()
            .to_string(),
        issued_at,
        expires_at,
        encoded: BASE64.encode(capability.encode_to_vec()),
    }
}
