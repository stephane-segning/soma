use std::time::SystemTime;

use soma_storage::RepositoryProvider;
use tracing::warn;

use crate::time::epoch_seconds;

pub async fn requeue_or_dead(repos: &dyn RepositoryProvider, mailbox_id: &str) {
    let now_secs = epoch_seconds(SystemTime::now());
    let entry = match repos.mailbox_repo().get(mailbox_id).await {
        Ok(Some(entry)) => entry,
        Ok(None) => return,
        Err(err) => {
            warn!(%err, %mailbox_id, "failed to load mailbox entry");
            return;
        }
    };

    // Hard TTL: 24h.
    if now_secs.saturating_sub(entry.created_at) > 24 * 60 * 60 {
        let _ = repos.mailbox_repo().mark_dead(mailbox_id).await;
        return;
    }

    let attempts = entry.attempts.max(1) as u32;
    let exp = attempts.saturating_sub(1).min(8);
    // Retry between 5 and 30 minutes.
    let delay = (300_i64.saturating_mul(1_i64 << exp)).clamp(300, 1800);
    let _ = repos
        .mailbox_repo()
        .requeue(mailbox_id, now_secs + delay)
        .await;
}
