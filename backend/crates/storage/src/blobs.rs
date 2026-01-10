use async_trait::async_trait;
use soma_core::{Error, SomaResult};
use sqlx::Row;
use sqlx_utils::types::Pool;

#[derive(Debug, Clone)]
pub struct BlobMetadata {
    pub space_id: String,
    pub cid: String,
    pub size: i64,
    pub mime: String,
    pub name: String,
    pub created_at_ms: i64,
    pub last_seen_ms: i64,
}

#[derive(Debug, Clone)]
pub struct BlobRef {
    pub space_id: String,
    pub cid: String,
    pub document_id: String,
    pub created_at_ms: i64,
}

#[async_trait]
pub trait BlobRepository: Send + Sync {
    async fn upsert_blob(&self, blob: &BlobMetadata) -> SomaResult<()>;
    async fn get_blob(&self, space_id: &str, cid: &str) -> SomaResult<Option<BlobMetadata>>;
    async fn list_blobs(&self, space_id: &str, limit: u32, offset: u32)
        -> SomaResult<Vec<BlobMetadata>>;
    async fn list_blobs_for_document(
        &self,
        space_id: &str,
        document_id: &str,
    ) -> SomaResult<Vec<BlobMetadata>>;
    async fn add_ref(&self, reference: &BlobRef) -> SomaResult<()>;
}

#[derive(Clone, Debug)]
pub struct SqlBlobRepository {
    pool: Pool,
}

impl SqlBlobRepository {
    pub fn new(pool: Pool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl BlobRepository for SqlBlobRepository {
    async fn upsert_blob(&self, blob: &BlobMetadata) -> SomaResult<()> {
        sqlx::query(
            r#"
            INSERT INTO blobs (space_id, cid, size, mime, name, created_at_ms, last_seen_ms)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT(space_id, cid)
            DO UPDATE SET
                size = excluded.size,
                mime = CASE WHEN excluded.mime != '' THEN excluded.mime ELSE blobs.mime END,
                name = CASE WHEN excluded.name != '' THEN excluded.name ELSE blobs.name END,
                last_seen_ms = excluded.last_seen_ms
            "#,
        )
        .bind(&blob.space_id)
        .bind(&blob.cid)
        .bind(blob.size)
        .bind(&blob.mime)
        .bind(&blob.name)
        .bind(blob.created_at_ms)
        .bind(blob.last_seen_ms)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(())
    }

    async fn get_blob(&self, space_id: &str, cid: &str) -> SomaResult<Option<BlobMetadata>> {
        let row = sqlx::query(
            r#"
            SELECT space_id, cid, size, mime, name, created_at_ms, last_seen_ms
            FROM blobs
            WHERE space_id = $1 AND cid = $2
            "#,
        )
        .bind(space_id)
        .bind(cid)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(row.map(map_blob_row))
    }

    async fn list_blobs(
        &self,
        space_id: &str,
        limit: u32,
        offset: u32,
    ) -> SomaResult<Vec<BlobMetadata>> {
        let rows = sqlx::query(
            r#"
            SELECT space_id, cid, size, mime, name, created_at_ms, last_seen_ms
            FROM blobs
            WHERE space_id = $1
            ORDER BY last_seen_ms DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(space_id)
        .bind(limit as i64)
        .bind(offset as i64)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(rows.into_iter().map(map_blob_row).collect())
    }

    async fn list_blobs_for_document(
        &self,
        space_id: &str,
        document_id: &str,
    ) -> SomaResult<Vec<BlobMetadata>> {
        let rows = sqlx::query(
            r#"
            SELECT b.space_id, b.cid, b.size, b.mime, b.name, b.created_at_ms, b.last_seen_ms
            FROM blobs b
            INNER JOIN blob_refs r
                ON r.space_id = b.space_id AND r.cid = b.cid
            WHERE r.space_id = $1 AND r.document_id = $2
            ORDER BY b.last_seen_ms DESC
            "#,
        )
        .bind(space_id)
        .bind(document_id)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(rows.into_iter().map(map_blob_row).collect())
    }

    async fn add_ref(&self, reference: &BlobRef) -> SomaResult<()> {
        sqlx::query(
            r#"
            INSERT INTO blob_refs (space_id, cid, document_id, created_at_ms)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT(space_id, cid, document_id)
            DO NOTHING
            "#,
        )
        .bind(&reference.space_id)
        .bind(&reference.cid)
        .bind(&reference.document_id)
        .bind(reference.created_at_ms)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(())
    }
}

fn map_blob_row(row: sqlx::any::AnyRow) -> BlobMetadata {
    BlobMetadata {
        space_id: row.get("space_id"),
        cid: row.get("cid"),
        size: row.get("size"),
        mime: row.get("mime"),
        name: row.get("name"),
        created_at_ms: row.get("created_at_ms"),
        last_seen_ms: row.get("last_seen_ms"),
    }
}
