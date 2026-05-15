mod mapping;
mod queries;
mod repository;
mod state;

use async_trait::async_trait;
use soma_core::SomaResult;

pub use repository::SqlMailboxRepository;

#[derive(Debug, Clone)]
pub struct MailboxEntry {
    pub id: String,
    pub kind: String,
    pub space_id: Option<String>,
    pub subject_peer_id: Option<String>,
    pub status: String,
    pub attempts: i64,
    pub available_at: i64,
    pub lease_until: Option<i64>,
    pub leased_by: Option<String>,
    pub payload: Option<Vec<u8>>,
    pub created_at: i64,
}

#[derive(Debug, Clone)]
pub struct NewMailboxEntry {
    pub id: String,
    pub kind: String,
    pub space_id: Option<String>,
    pub subject_peer_id: Option<String>,
    pub available_at: i64,
    pub payload: Option<Vec<u8>>,
    pub created_at: i64,
}

#[async_trait]
pub trait MailboxRepository: Send + Sync {
    async fn enqueue(&self, entry: &NewMailboxEntry) -> SomaResult<()>;
    async fn get(&self, id: &str) -> SomaResult<Option<MailboxEntry>>;
    async fn list_due(&self, now: i64, limit: i64) -> SomaResult<Vec<MailboxEntry>>;
    async fn list_due_for_subject(
        &self,
        now: i64,
        subject_peer_id: &str,
        limit: i64,
    ) -> SomaResult<Vec<MailboxEntry>>;
    async fn list_for_subject(
        &self,
        subject_peer_id: &str,
        limit: i64,
        offset: i64,
    ) -> SomaResult<Vec<MailboxEntry>>;
    async fn requeue_expired_leases(&self, now: i64) -> SomaResult<u64>;
    async fn lease(&self, id: &str, leased_by: &str, lease_until: i64) -> SomaResult<u64>;
    async fn requeue(&self, id: &str, available_at: i64) -> SomaResult<u64>;
    async fn mark_done(&self, id: &str) -> SomaResult<u64>;
    async fn mark_dead(&self, id: &str) -> SomaResult<u64>;
}
