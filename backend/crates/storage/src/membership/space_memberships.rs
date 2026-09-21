use soma_core::{Error, SomaResult};
use sqlx_utils::types::Pool;

use super::{SpaceMembership, mapping::map_membership_row};

/// Insert a new membership row, or update an existing one — but only when
/// the write is at least as authoritative as what's already there.
///
/// # Conflict semantics (deliberate choice — see the fix report for
/// `soma-membership`'s membership-forgery hardening)
///
/// A brand new `(space_id, subject_peer_id)` row is always accepted (no
/// conflict is possible). An update to an EXISTING row is applied only if
/// the incoming `issuer_peer_id` is either:
///
///   1. identical to the row's *current* `issuer_peer_id` — the same
///      issuer renewing or changing the subject's role (e.g. an expiry
///      refresh), or
///   2. the space's pinned owner (`spaces.owner_peer_id`) — the owner can
///      always override a delegate's earlier decision.
///
/// Any other incoming write for an existing row is a no-op at the SQL
/// level (`rows_affected() == 0`); this function returns `Ok(false)` in
/// that case instead of silently succeeding, so callers can distinguish
/// "written" from "rejected".
///
/// This is an independent, storage-layer gate against a write that
/// already passed upstream verification still clobbering a *differently*
/// (but also legitimately) issued row for the same subject — e.g. two
/// different, both-trusted issuers disagreeing about one subject's role.
/// It is defence in depth, not the primary defence: the primary defence
/// against a *forged* capability is upstream, in
/// `soma_membership::verify_and_apply_inbound_join_decision` (trust-anchor
/// binding). A caller that reaches this repository directly, bypassing
/// that verified wrapper, gets no cryptographic protection at all from
/// this function — only "don't clobber silently".
pub(super) async fn upsert_membership(
    pool: &Pool,
    membership: &SpaceMembership,
) -> SomaResult<bool> {
    let result = sqlx::query(
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
        WHERE
            excluded.issuer_peer_id = space_memberships.issuer_peer_id
            OR excluded.issuer_peer_id = (
                SELECT owner_peer_id FROM spaces WHERE spaces.space_id = excluded.space_id
            )
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

    Ok(result.rows_affected() > 0)
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
