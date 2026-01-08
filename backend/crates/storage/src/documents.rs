use async_trait::async_trait;
use soma_core::{Error, SomaResult};
use sqlx::Row;
use sqlx_utils::types::Pool;

/// Stored Yoopta document.
#[derive(Debug, Clone)]
pub struct Document {
    pub space_id: String,
    pub document_id: String,
    pub content_json: String,
    pub published: bool,
    pub updated_at_ms: i64,
}

#[async_trait]
pub trait DocumentRepository: Send + Sync {
    async fn upsert_document(&self, document: &Document) -> SomaResult<()>;
    async fn get_document(
        &self,
        space_id: &str,
        document_id: &str,
    ) -> SomaResult<Option<Document>>;
}

#[derive(Clone, Debug)]
pub struct SqlDocumentRepository {
    pool: Pool,
}

impl SqlDocumentRepository {
    pub fn new(pool: Pool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl DocumentRepository for SqlDocumentRepository {
    async fn upsert_document(&self, document: &Document) -> SomaResult<()> {
        sqlx::query(
            r#"
            INSERT INTO documents (space_id, document_id, content_json, published, updated_at_ms)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT(space_id, document_id)
            DO UPDATE SET
                content_json = excluded.content_json,
                published = excluded.published,
                updated_at_ms = excluded.updated_at_ms
            "#,
        )
        .bind(&document.space_id)
        .bind(&document.document_id)
        .bind(&document.content_json)
        .bind(if document.published { 1_i64 } else { 0_i64 })
        .bind(document.updated_at_ms)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(())
    }

    async fn get_document(
        &self,
        space_id: &str,
        document_id: &str,
    ) -> SomaResult<Option<Document>> {
        let row = sqlx::query(
            r#"
            SELECT space_id, document_id, content_json, published, updated_at_ms
            FROM documents
            WHERE space_id = $1 AND document_id = $2
            "#,
        )
        .bind(space_id)
        .bind(document_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(row.map(map_document_row))
    }
}

fn map_document_row(row: sqlx::any::AnyRow) -> Document {
    let published: i64 = row.get("published");
    Document {
        space_id: row.get("space_id"),
        document_id: row.get("document_id"),
        content_json: row.get("content_json"),
        published: published != 0,
        updated_at_ms: row.get("updated_at_ms"),
    }
}
