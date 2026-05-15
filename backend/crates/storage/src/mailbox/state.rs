use soma_core::{Error, SomaResult};
use sqlx_utils::types::Pool;

pub(super) async fn requeue_expired_leases(pool: &Pool, now: i64) -> SomaResult<u64> {
    let res = sqlx::query(
        r#"
        UPDATE mailbox
        SET status = 'queued', lease_until = NULL, leased_by = NULL
        WHERE status = 'leased' AND lease_until IS NOT NULL AND lease_until <= $1
        "#,
    )
    .bind(now)
    .execute(pool)
    .await
    .map_err(Error::service)?;

    Ok(res.rows_affected())
}

pub(super) async fn lease(
    pool: &Pool,
    id: &str,
    leased_by: &str,
    lease_until: i64,
) -> SomaResult<u64> {
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
    .execute(pool)
    .await
    .map_err(Error::service)?;

    Ok(res.rows_affected())
}

pub(super) async fn requeue(pool: &Pool, id: &str, available_at: i64) -> SomaResult<u64> {
    update_status(
        pool,
        r#"
        UPDATE mailbox
        SET status = 'queued', available_at = $2, lease_until = NULL, leased_by = NULL
        WHERE id = $1
        "#,
        id,
        Some(available_at),
    )
    .await
}

pub(super) async fn mark_done(pool: &Pool, id: &str) -> SomaResult<u64> {
    update_status(
        pool,
        r#"
        UPDATE mailbox
        SET status = 'done', lease_until = NULL, leased_by = NULL
        WHERE id = $1
        "#,
        id,
        None,
    )
    .await
}

pub(super) async fn mark_dead(pool: &Pool, id: &str) -> SomaResult<u64> {
    update_status(
        pool,
        r#"
        UPDATE mailbox
        SET status = 'dead', lease_until = NULL, leased_by = NULL
        WHERE id = $1
        "#,
        id,
        None,
    )
    .await
}

async fn update_status(
    pool: &Pool,
    sql: &str,
    id: &str,
    available_at: Option<i64>,
) -> SomaResult<u64> {
    let mut query = sqlx::query(sql).bind(id);
    if let Some(available_at) = available_at {
        query = query.bind(available_at);
    }

    let res = query.execute(pool).await.map_err(Error::service)?;
    Ok(res.rows_affected())
}
