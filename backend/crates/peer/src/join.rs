use std::sync::Arc;
use std::time::SystemTime;

use async_trait::async_trait;
use libp2p::PeerId;
use prost_types::Timestamp;
use soma_proto_build::classroom::v1::{ClassId, JoinDecision, JoinDecisionType};

#[async_trait]
pub trait JoinDecider: Send + Sync {
    async fn decide(
        &self,
        request: &soma_proto_build::classroom::v1::JoinRequest,
        issuer: &PeerId,
    ) -> JoinDecision;
}

#[derive(Clone, Default)]
pub struct RejectAll;

#[async_trait]
impl JoinDecider for RejectAll {
    async fn decide(
        &self,
        request: &soma_proto_build::classroom::v1::JoinRequest,
        issuer: &PeerId,
    ) -> JoinDecision {
        let now = Timestamp::from(SystemTime::now());
        JoinDecision {
            decision_id: format!("reject-{}", issuer),
            class_id: request.class_id.clone().or_else(|| {
                Some(ClassId {
                    value: "unknown".into(),
                })
            }),
            subject_peer_id: request.peer_id.clone(),
            decision: JoinDecisionType::JoinRejected as i32,
            reason: "issuer not configured".to_string(),
            capability: None,
            created_at: Some(now),
        }
    }
}

pub fn default_join_decider() -> Arc<dyn JoinDecider> {
    Arc::new(RejectAll)
}
