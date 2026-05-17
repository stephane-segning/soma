use soma_core::SomaResult;
use soma_storage::membership::SpaceMembership;

use super::{DaemonHandle, types::SpaceMemberRecord};

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
}

fn to_member_record(m: SpaceMembership) -> SpaceMemberRecord {
    SpaceMemberRecord {
        space_id: m.space_id,
        peer_id: m.subject_peer_id,
        role: m.role,
        expires_at: m.expires_at.unwrap_or_default(),
    }
}
