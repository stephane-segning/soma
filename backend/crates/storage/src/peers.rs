use async_trait::async_trait;
use soma_core::{Error, SomaResult};
use sqlx_utils::{
    traits::{Model, repository::Repository},
    types::Pool,
};

#[derive(Debug, Clone)]
pub struct PeerPublicKey {
    pub peer_id: String,
    pub public_key: Vec<u8>,
    pub updated_at: i64,
}

#[async_trait]
pub trait PeerPublicKeyRepository: Send + Sync {
    async fn upsert(&self, peer_id: &str, public_key: &[u8], updated_at: i64) -> SomaResult<()>;
    async fn get(&self, peer_id: &str) -> SomaResult<Option<PeerPublicKey>>;
}

#[derive(Clone, Debug)]
pub struct SqlPeerPublicKeyRepository {
    pool: Pool,
}

impl SqlPeerPublicKeyRepository {
    pub fn new(pool: Pool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl PeerPublicKeyRepository for SqlPeerPublicKeyRepository {
    async fn upsert(&self, peer_id: &str, public_key: &[u8], updated_at: i64) -> SomaResult<()> {
        sqlx::query(
            r#"
            INSERT INTO peer_public_keys (peer_id, public_key, updated_at)
            VALUES ($1, $2, $3)
            ON CONFLICT(peer_id)
            DO UPDATE SET
                public_key = excluded.public_key,
                updated_at = excluded.updated_at
            "#,
        )
        .bind(peer_id)
        .bind(public_key)
        .bind(updated_at)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(())
    }

    async fn get(&self, peer_id: &str) -> SomaResult<Option<PeerPublicKey>> {
        let row = sqlx::query(
            r#"
            SELECT peer_id, public_key, updated_at
            FROM peer_public_keys
            WHERE peer_id = $1
            "#,
        )
        .bind(peer_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(row.map(map_row))
    }
}

impl Repository<PeerPublicKey> for SqlPeerPublicKeyRepository {
    fn pool(&self) -> &Pool {
        &self.pool
    }
}

impl Model for PeerPublicKey {
    type Id = String;

    fn get_id(&self) -> Option<Self::Id> {
        Some(self.peer_id.clone())
    }
}

fn map_row(row: sqlx::any::AnyRow) -> PeerPublicKey {
    PeerPublicKey {
        peer_id: row.get("peer_id"),
        public_key: row.get("public_key"),
        updated_at: row.get("updated_at"),
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
