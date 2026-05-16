use async_trait::async_trait;
use soma_core::SomaResult;
use sqlx_utils::{
    traits::{Model, repository::Repository},
    types::Pool,
};

use super::{
    JoinDecision, JoinRequest, MembershipRepository, Space, SpaceMembership, join_decisions,
    join_requests, space_memberships, spaces,
};

#[derive(Clone, Debug)]
pub struct SqlMembershipRepository {
    pub(super) pool: Pool,
}

impl SqlMembershipRepository {
    pub fn new(pool: Pool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl MembershipRepository for SqlMembershipRepository {
    async fn upsert_space(&self, space: &Space) -> SomaResult<()> {
        spaces::upsert_space(&self.pool, space).await
    }

    async fn upsert_space_genesis(&self, space_id: &str, genesis: Vec<u8>) -> SomaResult<()> {
        spaces::upsert_space_genesis(&self.pool, space_id, genesis).await
    }

    async fn get_space_genesis(&self, space_id: &str) -> SomaResult<Option<Vec<u8>>> {
        spaces::get_space_genesis(&self.pool, space_id).await
    }

    async fn get_space(&self, space_id: &str) -> SomaResult<Option<Space>> {
        spaces::get_space(&self.pool, space_id).await
    }

    async fn list_spaces(
        &self,
        owner_peer_id: Option<&str>,
        query: Option<&str>,
        created_after: Option<i64>,
        created_before: Option<i64>,
        limit: u32,
        offset: u32,
    ) -> SomaResult<Vec<Space>> {
        spaces::list_spaces(
            &self.pool,
            owner_peer_id,
            query,
            created_after,
            created_before,
            limit,
            offset,
        )
        .await
    }

    async fn delete_space(&self, space_id: &str) -> SomaResult<u64> {
        spaces::delete_space(&self.pool, space_id).await
    }

    async fn upsert_membership(&self, membership: &SpaceMembership) -> SomaResult<()> {
        space_memberships::upsert_membership(&self.pool, membership).await
    }

    async fn delete_membership(&self, space_id: &str, subject_peer_id: &str) -> SomaResult<u64> {
        space_memberships::delete_membership(&self.pool, space_id, subject_peer_id).await
    }

    async fn get_membership(
        &self,
        space_id: &str,
        subject_peer_id: &str,
    ) -> SomaResult<Option<SpaceMembership>> {
        space_memberships::get_membership(&self.pool, space_id, subject_peer_id).await
    }

    async fn list_memberships(&self, space_id: &str) -> SomaResult<Vec<SpaceMembership>> {
        space_memberships::list_memberships(&self.pool, space_id).await
    }

    async fn list_memberships_by_subject(
        &self,
        subject_peer_id: &str,
    ) -> SomaResult<Vec<SpaceMembership>> {
        space_memberships::list_memberships_by_subject(&self.pool, subject_peer_id).await
    }

    async fn record_join_decision(&self, decision: &JoinDecision) -> SomaResult<()> {
        join_decisions::record_join_decision(&self.pool, decision).await
    }

    async fn latest_join_decision(
        &self,
        space_id: &str,
        subject_peer_id: &str,
    ) -> SomaResult<Option<JoinDecision>> {
        join_decisions::latest_join_decision(&self.pool, space_id, subject_peer_id).await
    }

    async fn upsert_join_request(&self, req: &JoinRequest) -> SomaResult<()> {
        join_requests::upsert_join_request(&self.pool, req).await
    }

    async fn delete_join_request(&self, request_id: &str) -> SomaResult<u64> {
        join_requests::delete_join_request(&self.pool, request_id).await
    }

    async fn get_join_request(&self, request_id: &str) -> SomaResult<Option<JoinRequest>> {
        join_requests::get_join_request(&self.pool, request_id).await
    }

    async fn list_join_requests(&self) -> SomaResult<Vec<JoinRequest>> {
        join_requests::list_join_requests(&self.pool).await
    }

    async fn list_join_requests_filtered(
        &self,
        target_peer_id: Option<&str>,
        is_outgoing: Option<bool>,
        limit: Option<u32>,
        offset: Option<u32>,
    ) -> SomaResult<Vec<JoinRequest>> {
        join_requests::list_join_requests_filtered(
            &self.pool,
            target_peer_id,
            is_outgoing,
            limit,
            offset,
        )
        .await
    }
}

impl Repository<Space> for SqlMembershipRepository {
    fn pool(&self) -> &Pool {
        &self.pool
    }
}

impl Repository<SpaceMembership> for SqlMembershipRepository {
    fn pool(&self) -> &Pool {
        &self.pool
    }
}

impl Repository<JoinDecision> for SqlMembershipRepository {
    fn pool(&self) -> &Pool {
        &self.pool
    }
}

impl Model for Space {
    type Id = String;

    fn get_id(&self) -> Option<Self::Id> {
        Some(self.space_id.clone())
    }
}

impl Model for SpaceMembership {
    type Id = (String, String);

    fn get_id(&self) -> Option<Self::Id> {
        Some((self.space_id.clone(), self.subject_peer_id.clone()))
    }
}

impl Model for JoinDecision {
    type Id = String;

    fn get_id(&self) -> Option<Self::Id> {
        Some(self.decision_id.clone())
    }
}
