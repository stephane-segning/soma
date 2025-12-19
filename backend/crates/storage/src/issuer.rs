use async_trait::async_trait;
use soma_core::{Error, SomaResult};
use sqlx_utils::{
    traits::{Model, repository::Repository},
    types::Pool,
};

#[derive(Debug, Clone)]
pub struct IssuerCapability {
    pub space_id: String,
    pub issuer_peer_id: String,
    pub delegate_peer_id: String,
    pub issued_at: i64,
    pub expires_at: Option<i64>,
    pub capability: Option<Vec<u8>>,
}

#[async_trait]
pub trait IssuerRepository: Send + Sync {
    async fn upsert(&self, cap: &IssuerCapability) -> SomaResult<()>;
    async fn get(
        &self,
        space_id: &str,
        delegate_peer_id: &str,
    ) -> SomaResult<Option<IssuerCapability>>;
    async fn delete(&self, space_id: &str, delegate_peer_id: &str) -> SomaResult<u64>;
}

#[derive(Clone, Debug)]
pub struct SqlIssuerRepository {
    pool: Pool,
}

impl SqlIssuerRepository {
    pub fn new(pool: Pool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl IssuerRepository for SqlIssuerRepository {
    async fn upsert(&self, cap: &IssuerCapability) -> SomaResult<()> {
        sqlx::query(
            r#"
            INSERT INTO issuer_capabilities (
                space_id, issuer_peer_id, delegate_peer_id, issued_at, expires_at, capability
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT(space_id, delegate_peer_id)
            DO UPDATE SET
                issuer_peer_id = excluded.issuer_peer_id,
                issued_at = excluded.issued_at,
                expires_at = excluded.expires_at,
                capability = excluded.capability
            "#,
        )
        .bind(&cap.space_id)
        .bind(&cap.issuer_peer_id)
        .bind(&cap.delegate_peer_id)
        .bind(cap.issued_at)
        .bind(cap.expires_at)
        .bind(&cap.capability)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(())
    }

    async fn get(
        &self,
        space_id: &str,
        delegate_peer_id: &str,
    ) -> SomaResult<Option<IssuerCapability>> {
        let row = sqlx::query(
            r#"
            SELECT space_id, issuer_peer_id, delegate_peer_id, issued_at, expires_at, capability
            FROM issuer_capabilities
            WHERE space_id = $1 AND delegate_peer_id = $2
            "#,
        )
        .bind(space_id)
        .bind(delegate_peer_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(row.map(map_row))
    }

    async fn delete(&self, space_id: &str, delegate_peer_id: &str) -> SomaResult<u64> {
        let res = sqlx::query(
            r#"
            DELETE FROM issuer_capabilities
            WHERE space_id = $1 AND delegate_peer_id = $2
            "#,
        )
        .bind(space_id)
        .bind(delegate_peer_id)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(res.rows_affected())
    }
}

impl Repository<IssuerCapability> for SqlIssuerRepository {
    fn pool(&self) -> &Pool {
        &self.pool
    }
}

impl Model for IssuerCapability {
    type Id = (String, String);

    fn get_id(&self) -> Option<Self::Id> {
        Some((self.space_id.clone(), self.delegate_peer_id.clone()))
    }
}

fn map_row(row: sqlx::any::AnyRow) -> IssuerCapability {
    IssuerCapability {
        space_id: row.get("space_id"),
        issuer_peer_id: row.get("issuer_peer_id"),
        delegate_peer_id: row.get("delegate_peer_id"),
        issued_at: row.get("issued_at"),
        expires_at: row.get("expires_at"),
        capability: row.get("capability"),
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
