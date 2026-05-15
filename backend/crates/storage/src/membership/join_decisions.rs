use soma_core::{Error, SomaResult};
use sqlx_utils::types::Pool;

use super::{JoinDecision, mapping::map_join_decision_row};

pub(super) async fn record_join_decision(
    pool: &Pool,
    decision: &JoinDecision,
) -> SomaResult<()> {
    sqlx::query(
        r#"
        INSERT INTO join_decisions (
            decision_id, space_id, subject_peer_id, decision, reason, created_at, capability
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT(decision_id)
        DO UPDATE SET
            space_id = excluded.space_id,
            subject_peer_id = excluded.subject_peer_id,
            decision = excluded.decision,
            reason = excluded.reason,
            created_at = excluded.created_at,
            capability = excluded.capability
        "#,
    )
    .bind(&decision.decision_id)
    .bind(&decision.space_id)
    .bind(&decision.subject_peer_id)
    .bind(decision.decision)
    .bind(&decision.reason)
    .bind(decision.created_at)
    .bind(&decision.capability)
    .execute(pool)
    .await
    .map_err(Error::service)?;

    Ok(())
}

pub(super) async fn latest_join_decision(
    pool: &Pool,
    space_id: &str,
    subject_peer_id: &str,
) -> SomaResult<Option<JoinDecision>> {
    let row = sqlx::query(
        r#"
        SELECT decision_id, space_id, subject_peer_id, decision, reason, created_at, capability
        FROM join_decisions
        WHERE space_id = $1 AND subject_peer_id = $2
        ORDER BY created_at DESC
        LIMIT 1
        "#,
    )
    .bind(space_id)
    .bind(subject_peer_id)
    .fetch_optional(pool)
    .await
    .map_err(Error::service)?;

    Ok(row.map(map_join_decision_row))
}
