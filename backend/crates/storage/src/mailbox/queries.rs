use soma_core::{Error, SomaResult};
use sqlx_utils::types::Pool;

use super::{MailboxEntry, NewMailboxEntry, mapping::map_row};

pub(super) async fn enqueue(pool: &Pool, entry: &NewMailboxEntry) -> SomaResult<()> {
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
    .execute(pool)
    .await
    .map_err(Error::service)?;

    Ok(())
}

pub(super) async fn get(pool: &Pool, id: &str) -> SomaResult<Option<MailboxEntry>> {
    let sql = format!("{} WHERE id = $1", select_mailbox());
    let row = sqlx::query(&sql)
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(Error::service)?;

    Ok(row.map(map_row))
}

pub(super) async fn list_due(pool: &Pool, now: i64, limit: i64) -> SomaResult<Vec<MailboxEntry>> {
    let sql = format!(
        "{} WHERE status = 'queued' AND available_at <= $1 ORDER BY available_at ASC, id ASC LIMIT $2",
        select_mailbox()
    );
    let rows = sqlx::query(&sql)
        .bind(now)
        .bind(limit)
        .fetch_all(pool)
        .await
        .map_err(Error::service)?;

    Ok(rows.into_iter().map(map_row).collect())
}

pub(super) async fn list_due_for_subject(
    pool: &Pool,
    now: i64,
    subject_peer_id: &str,
    limit: i64,
) -> SomaResult<Vec<MailboxEntry>> {
    let sql = format!(
        "{} WHERE status = 'queued' AND available_at <= $1 AND subject_peer_id = $2 ORDER BY available_at ASC, id ASC LIMIT $3",
        select_mailbox()
    );
    let rows = sqlx::query(&sql)
        .bind(now)
        .bind(subject_peer_id)
        .bind(limit)
        .fetch_all(pool)
        .await
        .map_err(Error::service)?;

    Ok(rows.into_iter().map(map_row).collect())
}

pub(super) async fn list_for_subject(
    pool: &Pool,
    subject_peer_id: &str,
    limit: i64,
    offset: i64,
) -> SomaResult<Vec<MailboxEntry>> {
    let sql = format!(
        "{} WHERE subject_peer_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3",
        select_mailbox()
    );
    let rows = sqlx::query(&sql)
        .bind(subject_peer_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
        .map_err(Error::service)?;

    Ok(rows.into_iter().map(map_row).collect())
}

fn select_mailbox() -> &'static str {
    r#"
    SELECT id, kind, space_id, subject_peer_id, status, attempts,
           available_at, lease_until, leased_by, payload, created_at
    FROM mailbox
    "#
}
