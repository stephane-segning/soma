use async_trait::async_trait;
use soma_core::{Error, SomaResult};
use sqlx_utils::{
    traits::{Model, repository::Repository},
    types::Pool,
};

#[derive(Debug, Clone)]
pub struct Space {
    pub space_id: String,
    pub display_name: Option<String>,
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
}

#[async_trait]
pub trait MembershipRepository: Send + Sync {
    async fn upsert_space(&self, space: &Space) -> SomaResult<()>;
    async fn upsert_membership(&self, membership: &SpaceMembership) -> SomaResult<()>;
    async fn delete_membership(&self, space_id: &str, subject_peer_id: &str) -> SomaResult<u64>;
    async fn get_membership(
        &self,
        space_id: &str,
        subject_peer_id: &str,
    ) -> SomaResult<Option<SpaceMembership>>;
    async fn list_memberships(&self, space_id: &str) -> SomaResult<Vec<SpaceMembership>>;
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
}

#[derive(Clone, Debug)]
pub struct SqlMembershipRepository {
    pool: Pool,
}

impl SqlMembershipRepository {
    pub fn new(pool: Pool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl MembershipRepository for SqlMembershipRepository {
    async fn upsert_space(&self, space: &Space) -> SomaResult<()> {
        sqlx::query(
            r#"
            INSERT INTO spaces (space_id, display_name, created_at)
            VALUES ($1, $2, $3)
            ON CONFLICT(space_id)
            DO UPDATE SET display_name = excluded.display_name, created_at = excluded.created_at
            "#,
        )
        .bind(&space.space_id)
        .bind(&space.display_name)
        .bind(space.created_at)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(())
    }

    async fn upsert_membership(&self, membership: &SpaceMembership) -> SomaResult<()> {
        sqlx::query(
            r#"
            INSERT INTO space_memberships (
                space_id, subject_peer_id, role, issuer_peer_id, issued_at, expires_at, capability
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT(space_id, subject_peer_id)
            DO UPDATE SET
                role = excluded.role,
                issuer_peer_id = excluded.issuer_peer_id,
                issued_at = excluded.issued_at,
                expires_at = excluded.expires_at,
                capability = excluded.capability
            "#,
        )
        .bind(&membership.space_id)
        .bind(&membership.subject_peer_id)
        .bind(&membership.role)
        .bind(&membership.issuer_peer_id)
        .bind(membership.issued_at)
        .bind(membership.expires_at)
        .bind(&membership.capability)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(())
    }

    async fn delete_membership(&self, space_id: &str, subject_peer_id: &str) -> SomaResult<u64> {
        let res = sqlx::query(
            r#"
            DELETE FROM space_memberships
            WHERE space_id = $1 AND subject_peer_id = $2
            "#,
        )
        .bind(space_id)
        .bind(subject_peer_id)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(res.rows_affected())
    }

    async fn get_membership(
        &self,
        space_id: &str,
        subject_peer_id: &str,
    ) -> SomaResult<Option<SpaceMembership>> {
        let row = sqlx::query(
            r#"
            SELECT space_id, subject_peer_id, role, issuer_peer_id, issued_at, expires_at, capability
            FROM space_memberships
            WHERE space_id = $1 AND subject_peer_id = $2
            "#,
        )
        .bind(space_id)
        .bind(subject_peer_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(row.map(map_membership_row))
    }

    async fn list_memberships(&self, space_id: &str) -> SomaResult<Vec<SpaceMembership>> {
        let rows = sqlx::query(
            r#"
            SELECT space_id, subject_peer_id, role, issuer_peer_id, issued_at, expires_at, capability
            FROM space_memberships
            WHERE space_id = $1
            ORDER BY subject_peer_id
            "#,
        )
        .bind(space_id)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(rows.into_iter().map(map_membership_row).collect())
    }

    async fn record_join_decision(&self, decision: &JoinDecision) -> SomaResult<()> {
        sqlx::query(
            r#"
            INSERT INTO join_decisions (
                decision_id, space_id, subject_peer_id, decision, reason, created_at, capability
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT(decision_id)
            DO UPDATE SET
                space_id = excluded.space_id,
                subject_peer_id = excluded.subject_peer_id,
                decision = excluded.decision,
                reason = excluded.reason,
                created_at = excluded.created_at,
                capability = excluded.capability
            "#,
        )
        .bind(&decision.decision_id)
        .bind(&decision.space_id)
        .bind(&decision.subject_peer_id)
        .bind(decision.decision)
        .bind(&decision.reason)
        .bind(decision.created_at)
        .bind(&decision.capability)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(())
    }

    async fn latest_join_decision(
        &self,
        space_id: &str,
        subject_peer_id: &str,
    ) -> SomaResult<Option<JoinDecision>> {
        let row = sqlx::query(
            r#"
            SELECT decision_id, space_id, subject_peer_id, decision, reason, created_at, capability
            FROM join_decisions
            WHERE space_id = $1 AND subject_peer_id = $2
            ORDER BY created_at DESC
            LIMIT 1
            "#,
        )
        .bind(space_id)
        .bind(subject_peer_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(row.map(map_join_decision_row))
    }

    async fn upsert_join_request(&self, req: &JoinRequest) -> SomaResult<()> {
        sqlx::query(
            r#"
            INSERT INTO join_requests (
                request_id, space_id, subject_peer_id, display_name, device_name, requested_role, created_at, payload
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT(request_id)
            DO UPDATE SET
                space_id = excluded.space_id,
                subject_peer_id = excluded.subject_peer_id,
                display_name = excluded.display_name,
                device_name = excluded.device_name,
                requested_role = excluded.requested_role,
                created_at = excluded.created_at,
                payload = excluded.payload
            "#,
        )
        .bind(&req.request_id)
        .bind(&req.space_id)
        .bind(&req.subject_peer_id)
        .bind(&req.display_name)
        .bind(&req.device_name)
        .bind(req.requested_role)
        .bind(req.created_at)
        .bind(&req.payload)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(())
    }

    async fn delete_join_request(&self, request_id: &str) -> SomaResult<u64> {
        let res = sqlx::query(
            r#"
            DELETE FROM join_requests
            WHERE request_id = $1
            "#,
        )
        .bind(request_id)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(res.rows_affected())
    }

    async fn list_join_requests(&self) -> SomaResult<Vec<JoinRequest>> {
        let rows = sqlx::query(
            r#"
            SELECT request_id, space_id, subject_peer_id, display_name, device_name, requested_role, created_at, payload
            FROM join_requests
            ORDER BY created_at DESC
            "#,
        )
        .fetch_all(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(rows.into_iter().map(map_join_request_row).collect())
    }

    async fn get_join_request(&self, request_id: &str) -> SomaResult<Option<JoinRequest>> {
        let row = sqlx::query(
            r#"
            SELECT request_id, space_id, subject_peer_id, display_name, device_name, requested_role, created_at, payload
            FROM join_requests
            WHERE request_id = $1
            "#,
        )
        .bind(request_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(row.map(map_join_request_row))
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

fn map_join_decision_row(row: sqlx::any::AnyRow) -> JoinDecision {
    JoinDecision {
        decision_id: row.get("decision_id"),
        space_id: row.get("space_id"),
        subject_peer_id: row.get("subject_peer_id"),
        decision: row.get("decision"),
        reason: row.get("reason"),
        created_at: row.get("created_at"),
        capability: row.get("capability"),
    }
}

fn map_membership_row(row: sqlx::any::AnyRow) -> SpaceMembership {
    SpaceMembership {
        space_id: row.get("space_id"),
        subject_peer_id: row.get("subject_peer_id"),
        role: row.get("role"),
        issuer_peer_id: row.get("issuer_peer_id"),
        issued_at: row.get("issued_at"),
        expires_at: row.get("expires_at"),
        capability: row.get("capability"),
    }
}

fn map_join_request_row(row: sqlx::any::AnyRow) -> JoinRequest {
    JoinRequest {
        request_id: row.get("request_id"),
        space_id: row.get("space_id"),
        subject_peer_id: row.get("subject_peer_id"),
        display_name: row.get("display_name"),
        device_name: row.get("device_name"),
        requested_role: row.get("requested_role"),
        created_at: row.get("created_at"),
        payload: row.get("payload"),
    }
}

trait AnyRowExt {
    fn get<T: sqlx::Type<sqlx::Any> + for<'r> sqlx::Decode<'r, sqlx::Any> + Send + 'static>(
        &self,
        col: &str,
    ) -> T;
}

impl AnyRowExt for sqlx::any::AnyRow {
    fn get<T: sqlx::Type<sqlx::Any> + for<'r> sqlx::Decode<'r, sqlx::Any> + Send + 'static>(
        &self,
        col: &str,
    ) -> T {
        sqlx::Row::get(self, col)
    }
}
