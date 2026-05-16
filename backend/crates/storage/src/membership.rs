mod join_decisions;
mod join_requests;
mod mapping;
mod repository;
mod space_memberships;
mod spaces;

use async_trait::async_trait;
use soma_core::SomaResult;

pub use repository::SqlMembershipRepository;

#[derive(Debug, Clone)]
pub struct Space {
    pub space_id: String,
    pub display_name: Option<String>,
    pub owner_peer_id: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone)]
pub struct SpaceMembership {
    pub space_id: String,
    pub subject_peer_id: String,
    pub role: String,
    pub issuer_peer_id: String,
    pub issued_at: i64,
    pub expires_at: Option<i64>,
    pub capability: Option<Vec<u8>>,
}

#[derive(Debug, Clone)]
pub struct JoinDecision {
    pub decision_id: String,
    pub space_id: String,
    pub subject_peer_id: String,
    pub decision: i32,
    pub reason: Option<String>,
    pub created_at: i64,
    pub capability: Option<Vec<u8>>,
}

#[derive(Debug, Clone)]
pub struct JoinRequest {
    pub request_id: String,
    pub space_id: String,
    pub subject_peer_id: String,
    pub display_name: String,
    pub device_name: String,
    pub requested_role: i32,
    pub created_at: i64,
    pub payload: Option<Vec<u8>>,
    pub target_peer_id: Option<String>,
    pub status: String,
    pub attempts: i64,
    pub next_attempt_at: i64,
    pub last_error: Option<String>,
    pub is_outgoing: bool,
}

#[async_trait]
pub trait MembershipRepository: Send + Sync {
    async fn upsert_space(&self, space: &Space) -> SomaResult<()>;
    async fn upsert_space_genesis(&self, space_id: &str, genesis: Vec<u8>) -> SomaResult<()>;
    async fn get_space_genesis(&self, space_id: &str) -> SomaResult<Option<Vec<u8>>>;
    async fn get_space(&self, space_id: &str) -> SomaResult<Option<Space>>;
    async fn list_spaces(
        &self,
        owner_peer_id: Option<&str>,
        query: Option<&str>,
        created_after: Option<i64>,
        created_before: Option<i64>,
        limit: u32,
        offset: u32,
    ) -> SomaResult<Vec<Space>>;
    async fn delete_space(&self, space_id: &str) -> SomaResult<u64>;
    async fn upsert_membership(&self, membership: &SpaceMembership) -> SomaResult<()>;
    async fn delete_membership(&self, space_id: &str, subject_peer_id: &str) -> SomaResult<u64>;
    async fn get_membership(
        &self,
        space_id: &str,
        subject_peer_id: &str,
    ) -> SomaResult<Option<SpaceMembership>>;
    async fn list_memberships(&self, space_id: &str) -> SomaResult<Vec<SpaceMembership>>;
    async fn list_memberships_by_subject(
        &self,
        subject_peer_id: &str,
    ) -> SomaResult<Vec<SpaceMembership>>;
    async fn record_join_decision(&self, decision: &JoinDecision) -> SomaResult<()>;
    async fn latest_join_decision(
        &self,
        space_id: &str,
        subject_peer_id: &str,
    ) -> SomaResult<Option<JoinDecision>>;
    async fn upsert_join_request(&self, req: &JoinRequest) -> SomaResult<()>;
    async fn delete_join_request(&self, request_id: &str) -> SomaResult<u64>;
    async fn get_join_request(&self, request_id: &str) -> SomaResult<Option<JoinRequest>>;
    async fn list_join_requests(&self) -> SomaResult<Vec<JoinRequest>>;
    async fn list_join_requests_filtered(
        &self,
        target_peer_id: Option<&str>,
        is_outgoing: Option<bool>,
        limit: Option<u32>,
        offset: Option<u32>,
    ) -> SomaResult<Vec<JoinRequest>>;
}
