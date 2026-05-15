use soma_core::{Error, SomaResult};
use sqlx_utils::types::Pool;

use super::{SpaceMembership, mapping::map_membership_row};

pub(super) async fn upsert_membership(pool: &Pool, membership: &SpaceMembership) -> SomaResult<()> {
    sqlx::query(
        r#"
        INSERT INTO space_memberships (
            space_id, subject_peer_id, role, issuer_peer_id, issued_at, expires_at, capability
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT(space_id, subject_peer_id)
        DO UPDATE SET
            role = excluded.role,
            issuer_peer_id = excluded.issuer_peer_id,
            issued_at = excluded.issued_at,
            expires_at = excluded.expires_at,
            capability = excluded.capability
        "#,
    )
    .bind(&membership.space_id)
    .bind(&membership.subject_peer_id)
    .bind(&membership.role)
    .bind(&membership.issuer_peer_id)
    .bind(membership.issued_at)
    .bind(membership.expires_at)
    .bind(&membership.capability)
    .execute(pool)
    .await
    .map_err(Error::service)?;

    Ok(())
}

pub(super) async fn delete_membership(
    pool: &Pool,
    space_id: &str,
    subject_peer_id: &str,
) -> SomaResult<u64> {
    let res = sqlx::query(
        r#"
        DELETE FROM space_memberships
        WHERE space_id = $1 AND subject_peer_id = $2
        "#,
    )
    .bind(space_id)
    .bind(subject_peer_id)
    .execute(pool)
    .await
    .map_err(Error::service)?;

    Ok(res.rows_affected())
}

pub(super) async fn get_membership(
    pool: &Pool,
    space_id: &str,
    subject_peer_id: &str,
) -> SomaResult<Option<SpaceMembership>> {
    let row = sqlx::query(
        r#"
        SELECT space_id, subject_peer_id, role, issuer_peer_id, issued_at, expires_at, capability
        FROM space_memberships
        WHERE space_id = $1 AND subject_peer_id = $2
        "#,
    )
    .bind(space_id)
    .bind(subject_peer_id)
    .fetch_optional(pool)
    .await
    .map_err(Error::service)?;

    Ok(row.map(map_membership_row))
}

pub(super) async fn list_memberships(
    pool: &Pool,
    space_id: &str,
) -> SomaResult<Vec<SpaceMembership>> {
    let rows = sqlx::query(
        r#"
        SELECT space_id, subject_peer_id, role, issuer_peer_id, issued_at, expires_at, capability
        FROM space_memberships
        WHERE space_id = $1
        ORDER BY subject_peer_id
        "#,
    )
    .bind(space_id)
    .fetch_all(pool)
    .await
    .map_err(Error::service)?;

    Ok(rows.into_iter().map(map_membership_row).collect())
}

pub(super) async fn list_memberships_by_subject(
    pool: &Pool,
    subject_peer_id: &str,
) -> SomaResult<Vec<SpaceMembership>> {
    let rows = sqlx::query(
        r#"
        SELECT space_id, subject_peer_id, role, issuer_peer_id, issued_at, expires_at, capability
        FROM space_memberships
        WHERE subject_peer_id = $1
        ORDER BY space_id
        "#,
    )
    .bind(subject_peer_id)
    .fetch_all(pool)
    .await
    .map_err(Error::service)?;

    Ok(rows.into_iter().map(map_membership_row).collect())
}
