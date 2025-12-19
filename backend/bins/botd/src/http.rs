use std::{path::PathBuf, sync::Arc, time::SystemTime};

use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    routing::{get, post},
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use prost::Message;
use serde::{Deserialize, Serialize};
use soma_proto_build::classroom::v1::{ClassRole, MembershipCapability};
use tracing::error;

use crate::{
    join::{JoinDecisionError, JoinDecisionInput, JoinDecisionOutcome, JoinDecisionService},
    metrics::BotMetrics,
};

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
    pub join_service: JoinDecisionService,
}

#[derive(Debug, Deserialize)]
pub struct JoinDecisionRequest {
    pub space_id: String,
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

impl From<JoinDecisionRequest> for JoinDecisionInput {
    fn from(value: JoinDecisionRequest) -> Self {
        JoinDecisionInput {
            space_id: value.space_id,
            subject_peer_id: value.subject_peer_id,
            approve: value.approve,
            role: value.role,
            expires_in_secs: value.expires_in_secs,
            display_name: value.display_name,
            device_name: value.device_name,
            student_code: value.student_code,
            reason: value.reason,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct MembershipCapabilityView {
    pub space_id: String,
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
    pub space_id: String,
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

pub async fn serve_http(
    http_addr: std::net::SocketAddr,
    state: BotState,
) -> soma_core::SomaResult<()> {
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
    let input: JoinDecisionInput = payload.into();
    let outcome = state
        .join_service
        .decide(&state.issuer_peer_id, &state.metrics, input)
        .await
        .map_err(|err| match err {
            JoinDecisionError::Validation(msg) => {
                (StatusCode::BAD_REQUEST, Json(ErrorResponse { error: msg }))
            }
            JoinDecisionError::Persistence(err) => {
                error!(error = %err, "failed to persist join decision");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: "failed to persist join decision".into(),
                    }),
                )
            }
        })?;

    Ok(Json(decision_to_view(&outcome)))
}

fn decision_to_view(outcome: &JoinDecisionOutcome) -> JoinDecisionView {
    let created_at = outcome
        .issued_at
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default();

    JoinDecisionView {
        decision_id: outcome.decision.decision_id.clone(),
        decision: outcome.decision_type.as_str_name().to_string(),
        space_id: outcome
            .decision
            .class_id
            .as_ref()
            .map(|c| c.value.clone())
            .unwrap_or_default(),
        subject_peer_id: outcome
            .decision
            .subject_peer_id
            .as_ref()
            .map(|p| p.value.clone())
            .unwrap_or_default(),
        reason: outcome.decision.reason.clone(),
        created_at,
        decision_encoded: BASE64.encode(outcome.decision.encode_to_vec()),
        capability: outcome.decision.capability.as_ref().map(capability_to_view),
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
        space_id: capability
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
