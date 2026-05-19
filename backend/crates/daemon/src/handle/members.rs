use soma_core::SomaResult;
use soma_storage::membership::SpaceMembership;

use super::{DaemonHandle, types::SpaceMemberRecord};

const BOT_ROLE: &str = "bot";

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

    /// List every membership in `space_id` whose role is `bot`.
    ///
    /// The capability record schema doesn't yet store bot metadata
    /// (alias, scopes, status) — that's a follow-up tracked in the
    /// cutover status doc. Until then, the renderer hydrates aliases
    /// from the peer-id (UI-side concern) and treats every listed bot
    /// as `active`. This shape (`SpaceMemberRecord`) keeps the wire
    /// identical to `list_space_members` so the addition is purely a
    /// daemon-side filter.
    pub async fn list_space_bots(
        &self,
        space_id: &str,
    ) -> SomaResult<Vec<SpaceMemberRecord>> {
        let rows = self
            .state
            .repos
            .membership_repo()
            .list_memberships(space_id)
            .await?;
        Ok(rows
            .into_iter()
            .filter(|m| m.role.eq_ignore_ascii_case(BOT_ROLE))
            .map(to_member_record)
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
