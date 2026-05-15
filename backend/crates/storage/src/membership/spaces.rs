use soma_core::{Error, SomaResult};
use sqlx_utils::types::Pool;

use super::{Space, mapping::map_space_row};

pub(super) async fn upsert_space(pool: &Pool, space: &Space) -> SomaResult<()> {
    sqlx::query(
        r#"
        INSERT INTO spaces (space_id, display_name, owner_peer_id, created_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT(space_id)
        DO UPDATE SET
            display_name = COALESCE(excluded.display_name, spaces.display_name),
            owner_peer_id = COALESCE(spaces.owner_peer_id, excluded.owner_peer_id),
            created_at = spaces.created_at
        "#,
    )
    .bind(&space.space_id)
    .bind(&space.display_name)
    .bind(&space.owner_peer_id)
    .bind(space.created_at)
    .execute(pool)
    .await
    .map_err(Error::service)?;

    Ok(())
}

pub(super) async fn get_space(pool: &Pool, space_id: &str) -> SomaResult<Option<Space>> {
    let row = sqlx::query(
        r#"
        SELECT space_id, display_name, owner_peer_id, created_at
        FROM spaces
        WHERE space_id = $1
        "#,
    )
    .bind(space_id)
    .fetch_optional(pool)
    .await
    .map_err(Error::service)?;

    Ok(row.map(map_space_row))
}

pub(super) async fn list_spaces(
    pool: &Pool,
    owner_peer_id: Option<&str>,
    query: Option<&str>,
    created_after: Option<i64>,
    created_before: Option<i64>,
    limit: u32,
    offset: u32,
) -> SomaResult<Vec<Space>> {
    use sqlx::QueryBuilder;

    let mut qb = QueryBuilder::<sqlx::Any>::new(
        r#"
        SELECT space_id, display_name, owner_peer_id, created_at
        FROM spaces
        "#,
    );

    let mut has_where = false;
    let mut where_clause = |qb: &mut QueryBuilder<sqlx::Any>| {
        if !has_where {
            qb.push(" WHERE ");
            has_where = true;
        } else {
            qb.push(" AND ");
        }
    };

    if let Some(owner_peer_id) = owner_peer_id {
        where_clause(&mut qb);
        qb.push("owner_peer_id = ").push_bind(owner_peer_id);
    }

    if let Some(q) = query.map(str::trim).filter(|q| !q.is_empty()) {
        let like = format!("%{}%", q.to_lowercase());
        where_clause(&mut qb);
        qb.push("(LOWER(space_id) LIKE ")
            .push_bind(like.clone())
            .push(" OR LOWER(COALESCE(display_name, '')) LIKE ")
            .push_bind(like)
            .push(")");
    }

    if let Some(created_after) = created_after {
        where_clause(&mut qb);
        qb.push("created_at >= ").push_bind(created_after);
    }

    if let Some(created_before) = created_before {
        where_clause(&mut qb);
        qb.push("created_at <= ").push_bind(created_before);
    }

    qb.push(" ORDER BY created_at DESC ");
    qb.push(" LIMIT ").push_bind(limit as i64);
    qb.push(" OFFSET ").push_bind(offset as i64);

    let rows = qb.build().fetch_all(pool).await.map_err(Error::service)?;
    Ok(rows.into_iter().map(map_space_row).collect())
}

pub(super) async fn delete_space(pool: &Pool, space_id: &str) -> SomaResult<u64> {
    let mut tx = pool.begin().await.map_err(Error::service)?;

    for table in [
        "space_memberships",
        "join_decisions",
        "issuer_capabilities",
        "mailbox",
        "documents",
        "join_requests",
    ] {
        let sql = format!("DELETE FROM {table} WHERE space_id = $1");
        sqlx::query(&sql)
            .bind(space_id)
            .execute(&mut *tx)
            .await
            .map_err(Error::service)?;
    }

    let res = sqlx::query("DELETE FROM spaces WHERE space_id = $1")
        .bind(space_id)
        .execute(&mut *tx)
        .await
        .map_err(Error::service)?;

    tx.commit().await.map_err(Error::service)?;
    Ok(res.rows_affected())
}
