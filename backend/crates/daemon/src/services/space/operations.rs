use std::collections::HashSet;

use async_trait::async_trait;
use rand::random;
use soma_core::{Error, SomaResult};
use soma_membership::create_space_with_genesis;

use super::{
    manager::DefaultSpaceManager,
    types::{SpaceManager, SpaceRecord},
};

#[async_trait]
impl SpaceManager for DefaultSpaceManager {
    async fn list_spaces(
        &self,
        query: Option<String>,
        limit: u32,
        offset: u32,
    ) -> SomaResult<(Vec<SpaceRecord>, Option<u32>)> {
        let repo = self.repos.membership_repo();
        let rows = repo
            .list_spaces(None, query.as_deref(), None, None, limit, offset)
            .await?;
        let memberships = repo
            .list_memberships_by_subject(&self.peer_id.to_string())
            .await?;
        let allowed_space_ids: HashSet<String> =
            memberships.into_iter().map(|m| m.space_id).collect();

        let filtered: Vec<_> = rows
            .into_iter()
            .filter(|space| self.owns_space(space) || allowed_space_ids.contains(&space.space_id))
            .collect();
        let next_offset = (filtered.len() as u32 == limit).then_some(offset + limit);

        Ok((
            filtered
                .into_iter()
                .map(|space| self.record(space))
                .collect(),
            next_offset,
        ))
    }

    async fn get_space(&self, space_id: &str) -> SomaResult<SpaceRecord> {
        let repo = self.repos.membership_repo();
        let space = repo
            .get_space(space_id)
            .await?
            .ok_or_else(|| Error::service("space not found"))?;

        let peer_id = self.peer_id.to_string();
        let membership = repo.get_membership(space_id, &peer_id).await?;
        if !self.owns_space(&space) && membership.is_none() {
            return Err(Error::service("not a member of this space"));
        }

        Ok(self.record(space))
    }

    async fn create_space(
        &self,
        space_id: Option<String>,
        display_name: Option<String>,
    ) -> SomaResult<SpaceRecord> {
        let space_id = space_id
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| format!("space-{:016x}", random::<u64>()));
        let display_name = Self::normalize_display_name(display_name);

        create_space_with_genesis(
            self.repos.as_ref(),
            &self.signer,
            &space_id,
            display_name.clone(),
        )
        .await?;
        self.ensure_owner_membership(&space_id, display_name.clone())
            .await?;

        Ok(SpaceRecord {
            space_id,
            display_name,
            owner_peer_id: Some(self.peer_id.to_string()),
            created_at: Self::now_secs(),
        })
    }

    async fn update_space(
        &self,
        space_id: &str,
        display_name: Option<String>,
    ) -> SomaResult<SpaceRecord> {
        let mut space = self
            .require_owned_space(space_id, "only owner can update space")
            .await?;
        space.display_name = Self::normalize_display_name(display_name);
        self.repos.membership_repo().upsert_space(&space).await?;
        Ok(self.record(space))
    }

    async fn delete_space(&self, space_id: &str) -> SomaResult<bool> {
        self.require_owned_space(space_id, "only owner can delete space")
            .await?;
        let rows = self.repos.membership_repo().delete_space(space_id).await?;
        Ok(rows > 0)
    }

    async fn ensure_owned_space(
        &self,
        space_id: &str,
        display_name: Option<String>,
    ) -> SomaResult<()> {
        let repo = self.repos.membership_repo();
        if repo.get_space(space_id).await?.is_none() {
            create_space_with_genesis(
                self.repos.as_ref(),
                &self.signer,
                space_id,
                display_name.clone(),
            )
            .await?;
        }

        if repo
            .get_membership(space_id, &self.peer_id.to_string())
            .await?
            .is_some()
        {
            return Ok(());
        }

        self.ensure_owner_membership(space_id, display_name).await
    }
}
