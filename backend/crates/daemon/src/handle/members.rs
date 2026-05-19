use std::time::SystemTime;

use soma_core::SomaResult;
use soma_membership::bot_status;
use soma_storage::membership::SpaceMembership;

use super::{DaemonHandle, types::{SpaceBotRecord, SpaceMemberRecord}};

/// Map an `IssuerCapability` row onto `SpaceBotRecord`. `delegate_peer_id`
/// is the bot; `expires_at: None` becomes `0` (the daemon's no-expiry
/// sentinel). `alias` and `scopes` flow straight through.
///
/// `status` is derived: rows whose stored status is `"active"` and
/// whose `expires_at` has passed wall-clock-now are reported as
/// `"expired"` instead. Other states (`pending`, `failed`) pass
/// through unchanged so the renderer sees the persistent value the
/// handshake protocol writes.
fn issuer_to_bot_record(
    cap: soma_storage::issuer::IssuerCapability,
    now_secs: i64,
) -> SpaceBotRecord {
    let expires_at = cap.expires_at.unwrap_or_default();
    let derived_status =
        if cap.status == bot_status::ACTIVE && expires_at != 0 && expires_at <= now_secs {
            bot_status::EXPIRED.to_string()
        } else {
            cap.status
        };
    SpaceBotRecord {
        space_id: cap.space_id,
        peer_id: cap.delegate_peer_id,
        expires_at,
        alias: cap.alias,
        status: derived_status,
        scopes: cap.scopes,
    }
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}

impl DaemonHandle {
    pub async fn list_space_members(
        &self,
        space_id: &str,
    ) -> SomaResult<Vec<SpaceMemberRecord>> {
        let rows = self
            .state
            .repos
            .membership_repo()
            .list_memberships(space_id)
            .await?;
        Ok(rows.into_iter().map(to_member_record).collect())
    }

    pub async fn list_my_memberships(&self) -> SomaResult<Vec<SpaceMemberRecord>> {
        let peer_id = self.state.peer_id.to_string();
        let rows = self
            .state
            .repos
            .membership_repo()
            .list_memberships_by_subject(&peer_id)
            .await?;
        Ok(rows.into_iter().map(to_member_record).collect())
    }

    /// List every issuer capability stored against `space_id`. Bots are
    /// persisted as issuer capabilities by `issue_issuer_capability`, so
    /// reading from `issuer_repo` keeps the list view in sync with the
    /// add flow.
    ///
    /// Returns `SpaceBotRecord` — a bot-specific shape with `alias`
    /// (operator-typed label, nullable for legacy rows) and `scopes`
    /// (operator-typed scope identifiers, empty for legacy rows).
    /// `status` is derived at read time (expired/pending/active/failed).
    ///
    /// NOTE: `scopes` are stored + plumbed for forward-looking visibility
    /// only — runtime authorisation enforcement is NOT yet implemented.
    pub async fn list_space_bots(
        &self,
        space_id: &str,
    ) -> SomaResult<Vec<SpaceBotRecord>> {
        let caps = self
            .state
            .repos
            .issuer_repo()
            .list_by_space(space_id)
            .await?;
        let now = now_secs();
        Ok(caps
            .into_iter()
            .map(|cap| issuer_to_bot_record(cap, now))
            .collect())
    }
}

fn to_member_record(m: SpaceMembership) -> SpaceMemberRecord {
    SpaceMemberRecord {
        space_id: m.space_id,
        peer_id: m.subject_peer_id,
        role: m.role,
        expires_at: m.expires_at.unwrap_or_default(),
    }
}
