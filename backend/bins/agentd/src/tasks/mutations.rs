use anyhow::Context;
use rand::random;

use super::{
    db::now_ms,
    store::BackgroundTaskStore,
    types::{BackgroundTaskKind, BackgroundTaskRecord, BackgroundTaskStatus},
};

impl BackgroundTaskStore {
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
                task_id, kind, status, space_id, document_id, selection_text,
                persist_in_document, result_text, error, created_at_ms, updated_at_ms
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
}
