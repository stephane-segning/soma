use async_trait::async_trait;
use soma_core::{Error, SomaResult};
use sqlx::Row;
use sqlx_utils::types::Pool;

/// Navigation metadata for a page.
#[derive(Debug, Clone)]
pub struct Page {
    pub space_id: String,
    pub page_id: String,
    pub title: String,
    pub parent_page_ids: Vec<String>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}

#[async_trait]
pub trait PageRepository: Send + Sync {
    async fn create_page(&self, page: &Page) -> SomaResult<()>;
    async fn get_page(&self, space_id: &str, page_id: &str) -> SomaResult<Option<Page>>;
    async fn list_pages(&self, space_id: &str) -> SomaResult<Vec<Page>>;
    async fn update_title(&self, space_id: &str, page_id: &str, title: &str) -> SomaResult<u64>;
    async fn set_parents(
        &self,
        space_id: &str,
        page_id: &str,
        parent_page_ids: &[String],
    ) -> SomaResult<u64>;
    async fn delete_pages_for_space(&self, space_id: &str) -> SomaResult<u64>;
}

#[derive(Clone, Debug)]
pub struct SqlPageRepository {
    pool: Pool,
}

impl SqlPageRepository {
    pub fn new(pool: Pool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl PageRepository for SqlPageRepository {
    async fn create_page(&self, page: &Page) -> SomaResult<()> {
        let parents_json = serde_json::to_string(&page.parent_page_ids).map_err(Error::service)?;

        sqlx::query(
            r#"
            INSERT INTO pages (space_id, page_id, title, parent_page_ids_json, created_at_ms, updated_at_ms)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT(space_id, page_id)
            DO NOTHING
            "#,
        )
        .bind(&page.space_id)
        .bind(&page.page_id)
        .bind(&page.title)
        .bind(parents_json)
        .bind(page.created_at_ms)
        .bind(page.updated_at_ms)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(())
    }

    async fn get_page(&self, space_id: &str, page_id: &str) -> SomaResult<Option<Page>> {
        let row = sqlx::query(
            r#"
            SELECT space_id, page_id, title, parent_page_ids_json, created_at_ms, updated_at_ms
            FROM pages
            WHERE space_id = $1 AND page_id = $2
            "#,
        )
        .bind(space_id)
        .bind(page_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(row.map(map_page_row))
    }

    async fn list_pages(&self, space_id: &str) -> SomaResult<Vec<Page>> {
        let rows = sqlx::query(
            r#"
            SELECT space_id, page_id, title, parent_page_ids_json, created_at_ms, updated_at_ms
            FROM pages
            WHERE space_id = $1
            ORDER BY created_at_ms ASC
            "#,
        )
        .bind(space_id)
        .fetch_all(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(rows.into_iter().map(map_page_row).collect())
    }

    async fn update_title(&self, space_id: &str, page_id: &str, title: &str) -> SomaResult<u64> {
        let updated_at_ms = now_ms();
        let res = sqlx::query(
            r#"
            UPDATE pages
            SET title = $3, updated_at_ms = $4
            WHERE space_id = $1 AND page_id = $2
            "#,
        )
        .bind(space_id)
        .bind(page_id)
        .bind(title)
        .bind(updated_at_ms)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(res.rows_affected())
    }

    async fn set_parents(
        &self,
        space_id: &str,
        page_id: &str,
        parent_page_ids: &[String],
    ) -> SomaResult<u64> {
        let updated_at_ms = now_ms();
        let parents_json = serde_json::to_string(parent_page_ids).map_err(Error::service)?;

        let res = sqlx::query(
            r#"
            UPDATE pages
            SET parent_page_ids_json = $3, updated_at_ms = $4
            WHERE space_id = $1 AND page_id = $2
            "#,
        )
        .bind(space_id)
        .bind(page_id)
        .bind(parents_json)
        .bind(updated_at_ms)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(res.rows_affected())
    }

    async fn delete_pages_for_space(&self, space_id: &str) -> SomaResult<u64> {
        let res = sqlx::query(
            r#"
            DELETE FROM pages
            WHERE space_id = $1
            "#,
        )
        .bind(space_id)
        .execute(&self.pool)
        .await
        .map_err(Error::service)?;

        Ok(res.rows_affected())
    }
}

fn map_page_row(row: sqlx::any::AnyRow) -> Page {
    let parents_json: String = row.get("parent_page_ids_json");
    let parent_page_ids: Vec<String> = serde_json::from_str(&parents_json).unwrap_or_default();
    Page {
        space_id: row.get("space_id"),
        page_id: row.get("page_id"),
        title: row.get("title"),
        parent_page_ids,
        created_at_ms: row.get("created_at_ms"),
        updated_at_ms: row.get("updated_at_ms"),
    }
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}
