use soma_core::SomaResult;
use soma_storage::membership::SpaceMembership;

use super::{DaemonHandle, types::{SpaceBotRecord, SpaceMemberRecord}};

/// Map an `IssuerCapability` row onto `SpaceBotRecord`. `delegate_peer_id`
/// is the bot; `expires_at: None` becomes `0` (the daemon's no-expiry
/// sentinel, consistent with `to_member_record` below). `alias` flows
/// straight through.
fn issuer_to_bot_record(cap: soma_storage::issuer::IssuerCapability) -> SpaceBotRecord {
    SpaceBotRecord {
        space_id: cap.space_id,
        peer_id: cap.delegate_peer_id,
        expires_at: cap.expires_at.unwrap_or_default(),
        alias: cap.alias,
    }
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
    /// (operator-typed label, nullable for legacy rows). `scopes` and
    /// `status` are still pending capability-schema follow-ups
    /// (cutover-status doc); until they land, the renderer hard-codes
    /// `status = "active"`.
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
        Ok(caps.into_iter().map(issuer_to_bot_record).collect())
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
