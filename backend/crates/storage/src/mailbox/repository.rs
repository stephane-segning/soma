use async_trait::async_trait;
use soma_core::SomaResult;
use sqlx_utils::{
    traits::{Model, repository::Repository},
    types::Pool,
};

use super::{MailboxEntry, MailboxRepository, NewMailboxEntry, queries, state};

#[derive(Clone, Debug)]
pub struct SqlMailboxRepository {
    pool: Pool,
}

impl SqlMailboxRepository {
    pub fn new(pool: Pool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl MailboxRepository for SqlMailboxRepository {
    async fn enqueue(&self, entry: &NewMailboxEntry) -> SomaResult<()> {
        queries::enqueue(&self.pool, entry).await
    }

    async fn get(&self, id: &str) -> SomaResult<Option<MailboxEntry>> {
        queries::get(&self.pool, id).await
    }

    async fn list_due(&self, now: i64, limit: i64) -> SomaResult<Vec<MailboxEntry>> {
        queries::list_due(&self.pool, now, limit).await
    }

    async fn list_due_for_subject(
        &self,
        now: i64,
        subject_peer_id: &str,
        limit: i64,
    ) -> SomaResult<Vec<MailboxEntry>> {
        queries::list_due_for_subject(&self.pool, now, subject_peer_id, limit).await
    }

    async fn list_for_subject(
        &self,
        subject_peer_id: &str,
        limit: i64,
        offset: i64,
    ) -> SomaResult<Vec<MailboxEntry>> {
        queries::list_for_subject(&self.pool, subject_peer_id, limit, offset).await
    }

    async fn requeue_expired_leases(&self, now: i64) -> SomaResult<u64> {
        state::requeue_expired_leases(&self.pool, now).await
    }

    async fn lease(&self, id: &str, leased_by: &str, lease_until: i64) -> SomaResult<u64> {
        state::lease(&self.pool, id, leased_by, lease_until).await
    }

    async fn requeue(&self, id: &str, available_at: i64) -> SomaResult<u64> {
        state::requeue(&self.pool, id, available_at).await
    }

    async fn mark_done(&self, id: &str) -> SomaResult<u64> {
        state::mark_done(&self.pool, id).await
    }

    async fn mark_dead(&self, id: &str) -> SomaResult<u64> {
        state::mark_dead(&self.pool, id).await
    }
}

impl Repository<MailboxEntry> for SqlMailboxRepository {
    fn pool(&self) -> &Pool {
        &self.pool
    }
}

impl Model for MailboxEntry {
    type Id = String;

    fn get_id(&self) -> Option<Self::Id> {
        Some(self.id.clone())
    }
}

impl Model for NewMailboxEntry {
    type Id = String;

    fn get_id(&self) -> Option<Self::Id> {
        Some(self.id.clone())
    }
}
