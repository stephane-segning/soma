use async_trait::async_trait;
use libp2p::{PeerId, identity::Keypair};
use prost::Message;
use prost_types::Timestamp;
use rand::random;
use soma_common::sign_membership_capability;
use soma_core::{Error, SomaResult};
use soma_membership::{create_space, role_to_str};
use soma_proto_build::space;
use soma_proto_build::space::SpaceRole;
use soma_storage::{RepositoryProvider, membership::SpaceMembership};
use std::{
    collections::HashSet,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Debug, Clone)]
pub struct SpaceRecord {
    pub space_id: String,
    pub display_name: Option<String>,
    pub owner_peer_id: Option<String>,
    pub created_at: i64,
}

#[async_trait]
pub trait SpaceManager: Send + Sync {
    async fn list_spaces(
        &self,
        query: Option<String>,
        limit: u32,
        offset: u32,
    ) -> SomaResult<(Vec<SpaceRecord>, Option<u32>)>;

    async fn get_space(&self, space_id: &str) -> SomaResult<SpaceRecord>;

    async fn create_space(
        &self,
        space_id: Option<String>,
        display_name: Option<String>,
    ) -> SomaResult<SpaceRecord>;

    async fn update_space(
        &self,
        space_id: &str,
        display_name: Option<String>,
    ) -> SomaResult<SpaceRecord>;

    async fn delete_space(&self, space_id: &str) -> SomaResult<bool>;

    async fn ensure_owned_space(
        &self,
        space_id: &str,
        display_name: Option<String>,
    ) -> SomaResult<()>;
}

#[derive(Clone)]
pub struct DefaultSpaceManager {
    repos: Arc<dyn RepositoryProvider>,
    signer: Keypair,
    peer_id: PeerId,
}

impl DefaultSpaceManager {
    pub fn new(repos: Arc<dyn RepositoryProvider>, signer: Keypair, peer_id: PeerId) -> Self {
        Self {
            repos,
            signer,
            peer_id,
        }
    }

    fn normalize_display_name(name: Option<String>) -> Option<String> {
        let Some(name) = name else { return None };
        let trimmed = name.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    }

    async fn ensure_owner_membership(
        &self,
        space_id: &str,
        display_name: Option<String>,
    ) -> SomaResult<()> {
        let now = SystemTime::now();
        let now_secs = now.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as i64;
        let mut membership_cap = space::MembershipCapability {
            space_id: Some(space::SpaceId {
                value: space_id.to_string(),
            }),
            subject_peer_id: Some(space::PeerId {
                value: self.peer_id.to_string(),
            }),
            role: SpaceRole::Owner as i32,
            permissions: Vec::new(),
            issued_at: Some(Timestamp::from(now)),
            expires_at: None,
            issuer_peer_id: Some(space::PeerId {
                value: self.peer_id.to_string(),
            }),
            issuer_cap: None,
            signed: None,
        };
        sign_membership_capability(&mut membership_cap, &self.signer)?;

        let repo = self.repos.membership_repo();
        repo.upsert_space(&soma_storage::membership::Space {
            space_id: space_id.to_string(),
            display_name,
            owner_peer_id: Some(self.peer_id.to_string()),
            created_at: now_secs,
        })
        .await?;

        repo.upsert_membership(&SpaceMembership {
            space_id: space_id.to_string(),
            subject_peer_id: self.peer_id.to_string(),
            role: role_to_str(SpaceRole::Owner).to_string(),
            issuer_peer_id: self.peer_id.to_string(),
            issued_at: now_secs,
            expires_at: None,
            capability: Some(membership_cap.encode_to_vec()),
        })
        .await?;

        Ok(())
    }
}

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
            .filter(|s| {
                s.owner_peer_id
                    .as_ref()
                    .map(|owner| owner == &self.peer_id.to_string())
                    .unwrap_or(false)
                    || allowed_space_ids.contains(&s.space_id)
            })
            .collect();

        let next_offset = if filtered.len() as u32 == limit {
            Some(offset + limit)
        } else {
            None
        };

        Ok((
            filtered
                .into_iter()
                .map(|s| SpaceRecord {
                    space_id: s.space_id,
                    display_name: s.display_name,
                    owner_peer_id: s.owner_peer_id,
                    created_at: s.created_at,
                })
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

        let is_owner = space
            .owner_peer_id
            .as_ref()
            .map(|owner| owner == &peer_id)
            .unwrap_or(false);

        if !is_owner && membership.is_none() {
            return Err(Error::service("not a member of this space"));
        }

        Ok(SpaceRecord {
            space_id: space.space_id,
            display_name: space.display_name,
            owner_peer_id: space.owner_peer_id,
            created_at: space.created_at,
        })
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

        create_space(
            self.repos.as_ref(),
            &self.peer_id,
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
            created_at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64,
        })
    }

    async fn update_space(
        &self,
        space_id: &str,
        display_name: Option<String>,
    ) -> SomaResult<SpaceRecord> {
        let repo = self.repos.membership_repo();
        let mut space = repo
            .get_space(space_id)
            .await?
            .ok_or_else(|| Error::service("space not found"))?;

        let peer_id = self.peer_id.to_string();
        let is_owner = space
            .owner_peer_id
            .as_ref()
            .map(|owner| owner == &peer_id)
            .unwrap_or(false);
        if !is_owner {
            return Err(Error::service("only owner can update space"));
        }

        space.display_name = Self::normalize_display_name(display_name);
        repo.upsert_space(&space).await?;

        Ok(SpaceRecord {
            space_id: space.space_id,
            display_name: space.display_name,
            owner_peer_id: space.owner_peer_id,
            created_at: space.created_at,
        })
    }

    async fn delete_space(&self, space_id: &str) -> SomaResult<bool> {
        let repo = self.repos.membership_repo();
        let space = repo
            .get_space(space_id)
            .await?
            .ok_or_else(|| Error::service("space not found"))?;

        let peer_id = self.peer_id.to_string();
        let is_owner = space
            .owner_peer_id
            .as_ref()
            .map(|owner| owner == &peer_id)
            .unwrap_or(false);
        if !is_owner {
            return Err(Error::service("only owner can delete space"));
        }

        let rows = repo.delete_space(space_id).await?;
        Ok(rows > 0)
    }

    async fn ensure_owned_space(
        &self,
        space_id: &str,
        display_name: Option<String>,
    ) -> SomaResult<()> {
        let repo = self.repos.membership_repo();
        if repo.get_space(space_id).await?.is_none() {
            create_space(
                self.repos.as_ref(),
                &self.peer_id,
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
