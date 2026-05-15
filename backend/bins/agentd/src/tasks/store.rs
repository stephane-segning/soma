use std::path::Path;

use anyhow::Context;
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};

use super::db::prepare_db_path;

#[derive(Clone, Debug)]
pub struct BackgroundTaskStore {
    pub(super) pool: SqlitePool,
}

impl BackgroundTaskStore {
    pub async fn connect(db_path: &Path) -> anyhow::Result<Self> {
        prepare_db_path(db_path).await?;
        let url = format!("sqlite://{}", db_path.to_string_lossy());

        let pool = SqlitePoolOptions::new()
            .max_connections(4)
            .connect(&url)
            .await
            .with_context(|| format!("failed to connect sqlite for background tasks: {url}"))?;

        let store = Self { pool };
        store.initialize_schema().await?;
        Ok(store)
    }

    async fn initialize_schema(&self) -> anyhow::Result<()> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS agent_background_tasks (
                task_id TEXT PRIMARY KEY,
                kind INTEGER NOT NULL,
                status INTEGER NOT NULL,
                space_id TEXT NOT NULL,
                document_id TEXT NOT NULL,
                selection_text TEXT NOT NULL,
                persist_in_document INTEGER NOT NULL DEFAULT 0,
                result_text TEXT,
                error TEXT,
                created_at_ms INTEGER NOT NULL,
                updated_at_ms INTEGER NOT NULL
            )
            "#,
        )
        .execute(&self.pool)
        .await
        .context("failed to create agent_background_tasks table")?;

        sqlx::query(
            r#"
            CREATE INDEX IF NOT EXISTS idx_agent_background_tasks_space
            ON agent_background_tasks(space_id, created_at_ms DESC)
            "#,
        )
        .execute(&self.pool)
        .await
        .context("failed to create idx_agent_background_tasks_space")?;

        Ok(())
    }
}
