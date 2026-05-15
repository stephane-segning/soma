use soma_core::{Error, SomaResult};
use sqlx_utils::types::Pool;

use super::{JoinRequest, mapping::map_join_request_row};

pub(super) async fn upsert_join_request(pool: &Pool, req: &JoinRequest) -> SomaResult<()> {
    sqlx::query(
        r#"
        INSERT INTO join_requests (
            request_id, space_id, subject_peer_id, display_name, device_name, requested_role,
            created_at, payload, target_peer_id, status, attempts, next_attempt_at, last_error,
            is_outgoing
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT(request_id)
        DO UPDATE SET
            space_id = excluded.space_id,
            subject_peer_id = excluded.subject_peer_id,
            display_name = excluded.display_name,
            device_name = excluded.device_name,
            requested_role = excluded.requested_role,
            created_at = excluded.created_at,
            payload = excluded.payload,
            target_peer_id = excluded.target_peer_id,
            status = excluded.status,
            attempts = excluded.attempts,
            next_attempt_at = excluded.next_attempt_at,
            last_error = excluded.last_error,
            is_outgoing = excluded.is_outgoing
        "#,
    )
    .bind(&req.request_id)
    .bind(&req.space_id)
    .bind(&req.subject_peer_id)
    .bind(&req.display_name)
    .bind(&req.device_name)
    .bind(req.requested_role)
    .bind(req.created_at)
    .bind(&req.payload)
    .bind(&req.target_peer_id)
    .bind(&req.status)
    .bind(req.attempts)
    .bind(req.next_attempt_at)
    .bind(&req.last_error)
    .bind(req.is_outgoing as i64)
    .execute(pool)
    .await
    .map_err(Error::service)?;

    Ok(())
}

pub(super) async fn delete_join_request(pool: &Pool, request_id: &str) -> SomaResult<u64> {
    let res = sqlx::query("DELETE FROM join_requests WHERE request_id = $1")
        .bind(request_id)
        .execute(pool)
        .await
        .map_err(Error::service)?;

    Ok(res.rows_affected())
}

pub(super) async fn list_join_requests(pool: &Pool) -> SomaResult<Vec<JoinRequest>> {
    let rows = sqlx::query(
        r#"
        SELECT request_id, space_id, subject_peer_id, display_name, device_name, requested_role,
               created_at, payload, target_peer_id, status, attempts, next_attempt_at, last_error,
               is_outgoing
        FROM join_requests
        ORDER BY created_at DESC
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(Error::service)?;

    Ok(rows.into_iter().map(map_join_request_row).collect())
}

pub(super) async fn list_join_requests_filtered(
    pool: &Pool,
    target_peer_id: Option<&str>,
    is_outgoing: Option<bool>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> SomaResult<Vec<JoinRequest>> {
    let mut qb = sqlx::QueryBuilder::<sqlx::Any>::new(select_join_requests());

    let mut first = true;
    if let Some(t) = target_peer_id {
        qb.push(" WHERE target_peer_id = ").push_bind(t);
        first = false;
    }
    if let Some(flag) = is_outgoing {
        if first {
            qb.push(" WHERE ");
        } else {
            qb.push(" AND ");
        }
        qb.push(" is_outgoing = ").push_bind(flag as i64);
    }

    qb.push(" ORDER BY created_at DESC, request_id DESC ");
    if let Some(lim) = limit {
        qb.push(" LIMIT ").push_bind(lim as i64);
    }
    if let Some(off) = offset {
        qb.push(" OFFSET ").push_bind(off as i64);
    }

    let rows = qb.build().fetch_all(pool).await.map_err(Error::service)?;
    Ok(rows.into_iter().map(map_join_request_row).collect())
}

pub(super) async fn get_join_request(
    pool: &Pool,
    request_id: &str,
) -> SomaResult<Option<JoinRequest>> {
    let sql = format!("{} WHERE request_id = $1", select_join_requests());
    let row = sqlx::query(&sql)
        .bind(request_id)
        .fetch_optional(pool)
        .await
        .map_err(Error::service)?;

    Ok(row.map(map_join_request_row))
}

fn select_join_requests() -> &'static str {
    r#"
    SELECT request_id, space_id, subject_peer_id, display_name, device_name, requested_role,
           created_at, payload, target_peer_id, status, attempts, next_attempt_at, last_error,
           is_outgoing
    FROM join_requests
    "#
}
