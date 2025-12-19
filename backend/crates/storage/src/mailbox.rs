use async_trait::async_trait;
use soma_core::{Error, SomaResult};
use sqlx_utils::{
    traits::{Model, repository::Repository},
    types::Pool,
};

#[derive(Debug, Clone)]
pub struct MailboxEntry {
    pub id: String,
    pub kind: String,
    pub space_id: Option<String>,
    pub subject_peer_id: Option<String>,
    pub status: String,
    pub attempts: i64,
    pub available_at: i64,
    pub lease_until: Option<i64>,
    pub leased_by: Option<String>,
    pub payload: Option<Vec<u8>>,
    pub created_at: i64,
}

#[derive(Debug, Clone)]
pub struct NewMailboxEntry {
    pub id: String,
    pub kind: String,
    pub space_id: Option<String>,
    pub subject_peer_id: Option<String>,
    pub available_at: i64,
    pub payload: Option<Vec<u8>>,
    pub created_at: i64,
}

#[async_trait]
pub trait MailboxRepository: Send + Sync {
    async fn enqueue(&self, entry: &NewMailboxEntry) -> SomaResult<()>;
    async fn list_due(&self, now: i64, limit: i64) -> SomaResult<Vec<MailboxEntry>>;
    async fn lease(&self, id: &str, leased_by: &str, lease_until: i64) -> SomaResult<u64>;
    async fn mark_done(&self, id: &str) -> SomaResult<u64>;
    async fn mark_dead(&self, id: &str) -> SomaResult<u64>;
}

#[derive(Clone, Debug)]
pub struct SqlMailboxRepository {
    pool: Pool,
}

impl SqlMailboxRepository {
    pub fn new(pool: Pool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl MailboxRepository for SqlMailboxRepository {
    async fn enqueue(&self, entry: &NewMailboxEntry) -> SomaResult<()> {
        sqlx::query(
            r#"
            INSERT INTO mailbox (
                id, kind, space_id, subject_peer_id, status, attempts,
                available_at, lease_until, leased_by, payload, created_at
            ) VALUES ($1, $2, $3, $4, 'queued', 0, $5, NULL, NULL, $6, $7)
            ON CONFLICT(id) DO NOTHING
            "#,
        )
        .bind(&entry.id)
        .bind(&entry.kind)
        .bind(&entry.space_id)
        .bind(&entry.subject_peer_id)
        .bind(entry.available_at)
        .bind(&entry.payload)
        .bind(entry.created_at)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(())
    }

    async fn list_due(&self, now: i64, limit: i64) -> SomaResult<Vec<MailboxEntry>> {
        let rows = sqlx::query(
            r#"
            SELECT id, kind, space_id, subject_peer_id, status, attempts,
                   available_at, lease_until, leased_by, payload, created_at
            FROM mailbox
            WHERE status = 'queued' AND available_at <= $1
            ORDER BY available_at ASC, id ASC
            LIMIT $2
            "#,
        )
        .bind(now)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(rows.into_iter().map(map_row).collect())
    }

    async fn lease(&self, id: &str, leased_by: &str, lease_until: i64) -> SomaResult<u64> {
        let res = sqlx::query(
            r#"
            UPDATE mailbox
            SET status = 'leased', lease_until = $3, leased_by = $2, attempts = attempts + 1
            WHERE id = $1 AND status = 'queued'
            "#,
        )
        .bind(id)
        .bind(leased_by)
        .bind(lease_until)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(res.rows_affected())
    }

    async fn mark_done(&self, id: &str) -> SomaResult<u64> {
        let res = sqlx::query(
            r#"
            UPDATE mailbox
            SET status = 'done', lease_until = NULL, leased_by = NULL
            WHERE id = $1
            "#,
        )
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(res.rows_affected())
    }

    async fn mark_dead(&self, id: &str) -> SomaResult<u64> {
        let res = sqlx::query(
            r#"
            UPDATE mailbox
            SET status = 'dead', lease_until = NULL, leased_by = NULL
            WHERE id = $1
            "#,
        )
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(res.rows_affected())
    }
}

impl Repository<MailboxEntry> for SqlMailboxRepository {
    fn pool(&self) -> &Pool {
        &self.pool
    }
}

impl Model for MailboxEntry {
    type Id = String;

    fn get_id(&self) -> Option<Self::Id> {
        Some(self.id.clone())
    }
}

impl Model for NewMailboxEntry {
    type Id = String;

    fn get_id(&self) -> Option<Self::Id> {
        Some(self.id.clone())
    }
}

fn map_row(row: sqlx::any::AnyRow) -> MailboxEntry {
    MailboxEntry {
        id: row.get("id"),
        kind: row.get("kind"),
        space_id: row.get("space_id"),
        subject_peer_id: row.get("subject_peer_id"),
        status: row.get("status"),
        attempts: row.get("attempts"),
        available_at: row.get("available_at"),
        lease_until: row.get("lease_until"),
        leased_by: row.get("leased_by"),
        payload: row.get("payload"),
        created_at: row.get("created_at"),
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
