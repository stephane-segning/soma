use std::time::{Duration, SystemTime};

use prost::Message;
use prost_types::Timestamp;
use rand::random;
use soma_proto_build::classroom::v1::{
    ClassId, ClassRole, JoinDecision, JoinDecisionType, MembershipCapability, PeerId,
};
use thiserror::Error;
use tracing::info;

use crate::metrics::{BotMetrics, JoinDecisionLabels};

#[derive(Debug, Clone)]
pub struct JoinDecisionInput {
    pub space_id: String,
    pub subject_peer_id: String,
    pub approve: bool,
    pub role: Option<String>,
    pub expires_in_secs: Option<u64>,
    pub display_name: Option<String>,
    pub device_name: Option<String>,
    pub student_code: Option<String>,
    pub reason: Option<String>,
}

impl JoinDecisionInput {
    pub fn validate(self) -> Result<Self, JoinDecisionError> {
        let space_id = self.space_id.trim();
        let subject_peer_id = self.subject_peer_id.trim();
        if space_id.is_empty() || subject_peer_id.is_empty() {
            return Err(JoinDecisionError::Validation(
                "space_id and subject_peer_id are required".into(),
            ));
        }

        Ok(Self {
            space_id: space_id.to_owned(),
            subject_peer_id: subject_peer_id.to_owned(),
            ..self
        })
    }
}

#[derive(Clone)]
pub struct JoinDecisionService {
    repo: JoinDecisionRepository,
}

impl JoinDecisionService {
    pub fn new(repo: JoinDecisionRepository) -> Self {
        Self { repo }
    }

    pub async fn decide(
        &self,
        issuer_peer_id: &str,
        metrics: &BotMetrics,
        input: JoinDecisionInput,
    ) -> Result<JoinDecisionOutcome, JoinDecisionError> {
        let input = input.validate()?;

        info!(
            space_id = %input.space_id,
            subject = %input.subject_peer_id,
            approve = input.approve,
            display_name = ?input.display_name,
            device_name = ?input.device_name,
            student_code = ?input.student_code,
            "join decision requested"
        );

        let issued_at = SystemTime::now();
        let expires_at = issued_at + Duration::from_secs(input.expires_in_secs.unwrap_or(86_400));
        let decision_id = format!("{:016x}", random::<u64>());

        let role = parse_role(input.role.as_deref());
        let (decision_type, reason, capability) = if input.approve {
            let capability = MembershipCapability {
                class_id: Some(ClassId {
                    value: input.space_id.clone(),
                }),
                subject_peer_id: Some(PeerId {
                    value: input.subject_peer_id.clone(),
                }),
                role: role as i32,
                permissions: vec![],
                issued_at: Some(Timestamp::from(issued_at)),
                expires_at: Some(Timestamp::from(expires_at)),
                issuer_peer_id: Some(PeerId {
                    value: issuer_peer_id.to_string(),
                }),
                issuer_cap: None,
                signed: None,
            };
            (
                JoinDecisionType::JoinApproved,
                input
                    .reason
                    .clone()
                    .unwrap_or_else(|| "approved by soma-botd".into()),
                Some(capability),
            )
        } else {
            (
                JoinDecisionType::JoinRejected,
                input
                    .reason
                    .clone()
                    .unwrap_or_else(|| "rejected by soma-botd".into()),
                None,
            )
        };

        let decision = JoinDecision {
            decision_id,
            class_id: Some(ClassId {
                value: input.space_id.clone(),
            }),
            subject_peer_id: Some(PeerId {
                value: input.subject_peer_id.clone(),
            }),
            decision: decision_type as i32,
            reason: reason.clone(),
            capability,
            created_at: Some(Timestamp::from(issued_at)),
        };

        let outcome = if input.approve {
            "approved"
        } else {
            "rejected"
        };
        metrics
            .join_decisions
            .get_or_create(&JoinDecisionLabels { outcome })
            .inc();

        self.repo.persist(&decision).await?;

        Ok(JoinDecisionOutcome {
            decision,
            decision_type,
            issued_at,
        })
    }
}

#[derive(Debug)]
pub struct JoinDecisionOutcome {
    pub decision: JoinDecision,
    pub decision_type: JoinDecisionType,
    pub issued_at: SystemTime,
}

#[derive(Clone)]
pub struct JoinDecisionRepository {
    pool: sqlx::AnyPool,
}

impl JoinDecisionRepository {
    pub fn new(pool: sqlx::AnyPool) -> Self {
        Self { pool }
    }

    pub async fn persist(&self, decision: &JoinDecision) -> Result<(), sqlx::Error> {
        let space_id = decision
            .class_id
            .as_ref()
            .map(|c| c.value.as_str())
            .unwrap_or_default();
        let subject_peer_id = decision
            .subject_peer_id
            .as_ref()
            .map(|p| p.value.as_str())
            .unwrap_or_default();
        let created_at = decision
            .created_at
            .as_ref()
            .map(|ts| ts.seconds)
            .unwrap_or_default();

        let capability_bytes = decision.capability.as_ref().map(|cap| cap.encode_to_vec());
        sqlx::query(
            r#"
            INSERT INTO join_decisions(decision_id, space_id, subject_peer_id, decision, reason, created_at, capability)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(decision.decision_id.as_str())
        .bind(space_id)
        .bind(subject_peer_id)
        .bind(decision.decision)
        .bind(decision.reason.as_str())
        .bind(created_at)
        .bind(capability_bytes)
        .execute(&self.pool)
        .await?;

        // If approved, upsert membership.
        if let Some(cap) = &decision.capability {
            let issued_at = cap
                .issued_at
                .as_ref()
                .map(|ts| ts.seconds)
                .unwrap_or_default();
            let expires_at = cap.expires_at.as_ref().map(|ts| ts.seconds);
            let role = cap.role;
            let issuer_peer_id = cap
                .issuer_peer_id
                .as_ref()
                .map(|p| p.value.as_str())
                .unwrap_or_default();
            let cap_bytes = cap.encode_to_vec();

            sqlx::query(
                r#"
                INSERT INTO space_memberships(space_id, subject_peer_id, role, issuer_peer_id, issued_at, expires_at, capability)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(space_id, subject_peer_id) DO UPDATE SET
                    role=excluded.role,
                    issuer_peer_id=excluded.issuer_peer_id,
                    issued_at=excluded.issued_at,
                    expires_at=excluded.expires_at,
                    capability=excluded.capability
                "#,
            )
            .bind(space_id)
            .bind(subject_peer_id)
            .bind(role)
            .bind(issuer_peer_id)
            .bind(issued_at)
            .bind(expires_at)
            .bind(cap_bytes)
            .execute(&self.pool)
            .await?;
        }

        Ok(())
    }
}

#[derive(Debug, Error)]
pub enum JoinDecisionError {
    #[error("invalid join request: {0}")]
    Validation(String),
    #[error("failed to persist join decision: {0}")]
    Persistence(#[from] sqlx::Error),
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
