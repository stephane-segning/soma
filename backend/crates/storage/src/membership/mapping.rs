use super::{JoinDecision, JoinRequest, Space, SpaceMembership};

pub(super) fn map_space_row(row: sqlx::any::AnyRow) -> Space {
    Space {
        space_id: row.get("space_id"),
        display_name: row.get("display_name"),
        owner_peer_id: row.get("owner_peer_id"),
        created_at: row.get("created_at"),
    }
}

pub(super) fn map_join_decision_row(row: sqlx::any::AnyRow) -> JoinDecision {
    JoinDecision {
        decision_id: row.get("decision_id"),
        space_id: row.get("space_id"),
        subject_peer_id: row.get("subject_peer_id"),
        decision: row.get("decision"),
        reason: row.get("reason"),
        created_at: row.get("created_at"),
        capability: row.get("capability"),
    }
}

pub(super) fn map_membership_row(row: sqlx::any::AnyRow) -> SpaceMembership {
    SpaceMembership {
        space_id: row.get("space_id"),
        subject_peer_id: row.get("subject_peer_id"),
        role: row.get("role"),
        issuer_peer_id: row.get("issuer_peer_id"),
        issued_at: row.get("issued_at"),
        expires_at: row.get("expires_at"),
        capability: row.get("capability"),
    }
}

pub(super) fn map_join_request_row(row: sqlx::any::AnyRow) -> JoinRequest {
    JoinRequest {
        request_id: row.get("request_id"),
        space_id: row.get("space_id"),
        subject_peer_id: row.get("subject_peer_id"),
        display_name: row.get("display_name"),
        device_name: row.get("device_name"),
        requested_role: row.get("requested_role"),
        created_at: row.get("created_at"),
        payload: row.get("payload"),
        target_peer_id: row.get("target_peer_id"),
        status: row.get("status"),
        attempts: row.get("attempts"),
        next_attempt_at: row.get("next_attempt_at"),
        last_error: row.get("last_error"),
        is_outgoing: row.get::<i64>("is_outgoing") != 0,
    }
}

trait AnyRowExt {
    fn get<T: sqlx::Type<sqlx::Any> + for<'r> sqlx::Decode<'r, sqlx::Any> + Send + 'static>(
        &self,
        col: &str,
    ) -> T;
}

impl AnyRowExt for sqlx::any::AnyRow {
    fn get<T: sqlx::Type<sqlx::Any> + for<'r> sqlx::Decode<'r, sqlx::Any> + Send + 'static>(
        &self,
        col: &str,
    ) -> T {
        sqlx::Row::get(self, col)
    }
}
