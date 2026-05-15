use anyhow::{Context, anyhow};
use sqlx::Row;

use super::{
    store::BackgroundTaskStore,
    types::{BackgroundTaskKind, BackgroundTaskRecord, BackgroundTaskStatus},
};

impl BackgroundTaskStore {
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
