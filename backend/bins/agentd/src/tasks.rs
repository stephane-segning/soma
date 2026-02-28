use std::{
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{Context, anyhow};
use rand::random;
use sqlx::{
    Row,
    sqlite::{SqlitePool, SqlitePoolOptions},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BackgroundTaskKind {
    ExplainSelection,
    ExpandSelection,
    ResearchSelection,
}

impl BackgroundTaskKind {
    pub fn from_i32(value: i32) -> Option<Self> {
        match value {
            1 => Some(Self::ExplainSelection),
            2 => Some(Self::ExpandSelection),
            3 => Some(Self::ResearchSelection),
            _ => None,
        }
    }

    pub fn as_i32(self) -> i32 {
        match self {
            Self::ExplainSelection => 1,
            Self::ExpandSelection => 2,
            Self::ResearchSelection => 3,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BackgroundTaskStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
}

impl BackgroundTaskStatus {
    pub fn from_i32(value: i32) -> Option<Self> {
        match value {
            1 => Some(Self::Queued),
            2 => Some(Self::Running),
            3 => Some(Self::Succeeded),
            4 => Some(Self::Failed),
            _ => None,
        }
    }

    pub fn as_i32(self) -> i32 {
        match self {
            Self::Queued => 1,
            Self::Running => 2,
            Self::Succeeded => 3,
            Self::Failed => 4,
        }
    }
}

#[derive(Debug, Clone)]
pub struct BackgroundTaskRecord {
    pub task_id: String,
    pub kind: BackgroundTaskKind,
    pub status: BackgroundTaskStatus,
    pub space_id: String,
    pub document_id: String,
    pub selection_text: String,
    pub persist_in_document: bool,
    pub result_text: Option<String>,
    pub error: Option<String>,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
}

#[derive(Clone, Debug)]
pub struct BackgroundTaskStore {
    pool: SqlitePool,
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

    pub async fn enqueue(
        &self,
        kind: BackgroundTaskKind,
        space_id: &str,
        document_id: &str,
        selection_text: &str,
        persist_in_document: bool,
    ) -> anyhow::Result<BackgroundTaskRecord> {
        let now = now_ms();
        let task_id = format!("agtask_{now}_{}", random::<u32>());
        let status = BackgroundTaskStatus::Queued;

        sqlx::query(
            r#"
            INSERT INTO agent_background_tasks (
                task_id,
                kind,
                status,
                space_id,
                document_id,
                selection_text,
                persist_in_document,
                result_text,
                error,
                created_at_ms,
                updated_at_ms
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, $8, $9)
            "#,
        )
        .bind(&task_id)
        .bind(kind.as_i32())
        .bind(status.as_i32())
        .bind(space_id)
        .bind(document_id)
        .bind(selection_text)
        .bind(if persist_in_document { 1 } else { 0 })
        .bind(i64::try_from(now).unwrap_or(i64::MAX))
        .bind(i64::try_from(now).unwrap_or(i64::MAX))
        .execute(&self.pool)
        .await
        .context("failed to enqueue background task")?;

        Ok(BackgroundTaskRecord {
            task_id,
            kind,
            status,
            space_id: space_id.to_string(),
            document_id: document_id.to_string(),
            selection_text: selection_text.to_string(),
            persist_in_document,
            result_text: None,
            error: None,
            created_at_ms: now,
            updated_at_ms: now,
        })
    }

    pub async fn mark_running(&self, task_id: &str) -> anyhow::Result<()> {
        self.update_state(task_id, BackgroundTaskStatus::Running, None, None)
            .await
    }

    pub async fn mark_succeeded(&self, task_id: &str, result_text: &str) -> anyhow::Result<()> {
        self.update_state(
            task_id,
            BackgroundTaskStatus::Succeeded,
            Some(result_text),
            None,
        )
        .await
    }

    pub async fn mark_failed(&self, task_id: &str, error: &str) -> anyhow::Result<()> {
        self.update_state(task_id, BackgroundTaskStatus::Failed, None, Some(error))
            .await
    }

    async fn update_state(
        &self,
        task_id: &str,
        status: BackgroundTaskStatus,
        result_text: Option<&str>,
        error: Option<&str>,
    ) -> anyhow::Result<()> {
        let now = now_ms();

        sqlx::query(
            r#"
            UPDATE agent_background_tasks
            SET status = $2,
                result_text = COALESCE($3, result_text),
                error = COALESCE($4, error),
                updated_at_ms = $5
            WHERE task_id = $1
            "#,
        )
        .bind(task_id)
        .bind(status.as_i32())
        .bind(result_text)
        .bind(error)
        .bind(i64::try_from(now).unwrap_or(i64::MAX))
        .execute(&self.pool)
        .await
        .with_context(|| format!("failed to update background task state: {task_id}"))?;

        Ok(())
    }

    pub async fn list(
        &self,
        space_id: Option<&str>,
        limit: u32,
    ) -> anyhow::Result<Vec<BackgroundTaskRecord>> {
        let clamped_limit = limit.clamp(1, 200);

        let rows = if let Some(space_id) = space_id.filter(|v| !v.trim().is_empty()) {
            sqlx::query(
                r#"
                SELECT task_id, kind, status, space_id, document_id, selection_text,
                       persist_in_document, result_text, error, created_at_ms, updated_at_ms
                FROM agent_background_tasks
                WHERE space_id = $1
                ORDER BY created_at_ms DESC
                LIMIT $2
                "#,
            )
            .bind(space_id)
            .bind(i64::from(clamped_limit))
            .fetch_all(&self.pool)
            .await
            .context("failed to list background tasks by space")?
        } else {
            sqlx::query(
                r#"
                SELECT task_id, kind, status, space_id, document_id, selection_text,
                       persist_in_document, result_text, error, created_at_ms, updated_at_ms
                FROM agent_background_tasks
                ORDER BY created_at_ms DESC
                LIMIT $1
                "#,
            )
            .bind(i64::from(clamped_limit))
            .fetch_all(&self.pool)
            .await
            .context("failed to list background tasks")?
        };

        rows.into_iter().map(map_row).collect()
    }
}

fn map_row(row: sqlx::sqlite::SqliteRow) -> anyhow::Result<BackgroundTaskRecord> {
    let kind = BackgroundTaskKind::from_i32(row.get::<i32, _>("kind"))
        .ok_or_else(|| anyhow!("invalid background task kind"))?;
    let status = BackgroundTaskStatus::from_i32(row.get::<i32, _>("status"))
        .ok_or_else(|| anyhow!("invalid background task status"))?;

    let created_at_i64: i64 = row.get("created_at_ms");
    let updated_at_i64: i64 = row.get("updated_at_ms");

    Ok(BackgroundTaskRecord {
        task_id: row.get("task_id"),
        kind,
        status,
        space_id: row.get("space_id"),
        document_id: row.get("document_id"),
        selection_text: row.get("selection_text"),
        persist_in_document: row.get::<i64, _>("persist_in_document") > 0,
        result_text: row.get::<Option<String>, _>("result_text"),
        error: row.get::<Option<String>, _>("error"),
        created_at_ms: u64::try_from(created_at_i64.max(0)).unwrap_or(0),
        updated_at_ms: u64::try_from(updated_at_i64.max(0)).unwrap_or(0),
    })
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u128::from(u64::MAX)) as u64
}

async fn prepare_db_path(path: &Path) -> anyhow::Result<()> {
    let parent: Option<PathBuf> = path.parent().map(Path::to_path_buf);
    if let Some(parent_dir) = parent {
        tokio::fs::create_dir_all(&parent_dir)
            .await
            .with_context(|| format!("failed to create db dir: {}", parent_dir.display()))?;
    }
    Ok(())
}
