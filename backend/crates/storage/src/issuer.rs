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
    /// Human alias the operator typed into the Bots-tab add form. Used
    /// purely for UI display + future `@bot:<alias>` mention resolution.
    /// Authz still keys on `(space_id, delegate_peer_id)`.
    pub alias: Option<String>,
    /// Persistent status of the delegation. Today only `"active"` is
    /// written on issuance; `"pending"` / `"failed"` flow in once the
    /// handshake protocol lands. The `expired` state is derived from
    /// `expires_at` at read time and never stored.
    pub status: String,
    /// Operator-typed scope identifiers from the Bots-tab Add form.
    /// Stored as a JSON-encoded array of strings in the `scopes` column.
    /// Defaults to empty when the column is NULL (pre-migration rows).
    ///
    /// Runtime enforcement is in `membership::ensure_can_issue_membership`,
    /// which reads this field and rejects capabilities whose non-empty
    /// scopes list doesn't include `"issue:membership"`.  An empty list is
    /// treated as "no restriction" for backward compat with pre-#92 rows.
    ///
    /// NOTE: enforcement is local-only (option B) — the signed
    /// `IssuerCapability` proto does not yet carry a scopes field.
    pub scopes: Vec<String>,
}

#[async_trait]
pub trait IssuerRepository: Send + Sync {
    async fn upsert(&self, cap: &IssuerCapability) -> SomaResult<()>;
    async fn get(
        &self,
        space_id: &str,
        delegate_peer_id: &str,
    ) -> SomaResult<Option<IssuerCapability>>;
    /// List every issuer capability currently stored for `space_id`. Used by
    /// `DaemonHandle::list_space_bots` — bots are persisted as issuer
    /// capabilities (not memberships), so this is the read path that
    /// matches the write path of `issue_issuer_capability`.
    async fn list_by_space(&self, space_id: &str) -> SomaResult<Vec<IssuerCapability>>;
    /// Update only the `status` field on an existing issuer capability
    /// row. Returns the number of rows affected (0 if the
    /// `(space_id, delegate_peer_id)` row doesn't exist). Used by the
    /// handshake handler to transition `pending → active|failed`
    /// without re-issuing the underlying signed capability.
    async fn update_status(
        &self,
        space_id: &str,
        delegate_peer_id: &str,
        status: &str,
    ) -> SomaResult<u64>;
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
        let scopes_json = serde_json::to_string(&cap.scopes)
            .unwrap_or_else(|_| "[]".to_string());
        sqlx::query(
            r#"
            INSERT INTO issuer_capabilities (
                space_id, issuer_peer_id, delegate_peer_id, issued_at, expires_at, capability, alias, status, scopes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT(space_id, delegate_peer_id)
            DO UPDATE SET
                issuer_peer_id = excluded.issuer_peer_id,
                issued_at = excluded.issued_at,
                expires_at = excluded.expires_at,
                capability = excluded.capability,
                alias = excluded.alias,
                status = excluded.status,
                scopes = excluded.scopes
            "#,
        )
        .bind(&cap.space_id)
        .bind(&cap.issuer_peer_id)
        .bind(&cap.delegate_peer_id)
        .bind(cap.issued_at)
        .bind(cap.expires_at)
        .bind(&cap.capability)
        .bind(&cap.alias)
        .bind(&cap.status)
        .bind(&scopes_json)
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
            SELECT space_id, issuer_peer_id, delegate_peer_id, issued_at, expires_at, capability, alias, status, scopes
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

    async fn list_by_space(&self, space_id: &str) -> SomaResult<Vec<IssuerCapability>> {
        let rows = sqlx::query(
            r#"
            SELECT space_id, issuer_peer_id, delegate_peer_id, issued_at, expires_at, capability, alias, status, scopes
            FROM issuer_capabilities
            WHERE space_id = $1
            ORDER BY issued_at DESC
            "#,
        )
        .bind(space_id)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(rows.into_iter().map(map_row).collect())
    }

    async fn update_status(
        &self,
        space_id: &str,
        delegate_peer_id: &str,
        status: &str,
    ) -> SomaResult<u64> {
        // Gate the transition on `status = 'pending'` so a late-arriving
        // ack/failed event from a superseded issuance attempt can't
        // overwrite the state of a newer one. Re-issuing a bot is an
        // `upsert` that resets the row to `pending`, which is the only
        // state this transition is valid against.
        let res = sqlx::query(
            r#"
            UPDATE issuer_capabilities
            SET status = $3
            WHERE space_id = $1 AND delegate_peer_id = $2 AND status = 'pending'
            "#,
        )
        .bind(space_id)
        .bind(delegate_peer_id)
        .bind(status)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(res.rows_affected())
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
    let scopes_json: Option<String> = row.get("scopes");
    let scopes = scopes_json
        .and_then(|json| serde_json::from_str::<Vec<String>>(&json).ok())
        .unwrap_or_default();
    IssuerCapability {
        space_id: row.get("space_id"),
        issuer_peer_id: row.get("issuer_peer_id"),
        delegate_peer_id: row.get("delegate_peer_id"),
        issued_at: row.get("issued_at"),
        expires_at: row.get("expires_at"),
        capability: row.get("capability"),
        alias: row.get("alias"),
        status: row.get("status"),
        scopes,
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
