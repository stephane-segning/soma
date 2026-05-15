use super::MailboxEntry;

pub(super) fn map_row(row: sqlx::any::AnyRow) -> MailboxEntry {
    MailboxEntry {
        id: row.get("id"),
        kind: row.get("kind"),
        space_id: row.get("space_id"),
        subject_peer_id: row.get("subject_peer_id"),
        status: row.get("status"),
        attempts: row.get("attempts"),
        available_at: row.get("available_at"),
        lease_until: row.get("lease_until"),
        leased_by: row.get("leased_by"),
        payload: row.get("payload"),
        created_at: row.get("created_at"),
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
