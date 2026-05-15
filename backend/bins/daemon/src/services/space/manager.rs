use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use libp2p::{PeerId, identity::Keypair};
use prost::Message;
use prost_types::Timestamp;
use soma_common::sign_membership_capability;
use soma_core::{Error, SomaResult};
use soma_membership::role_to_str;
use soma_proto_build::space;
use soma_proto_build::space::SpaceRole;
use soma_storage::{RepositoryProvider, membership::SpaceMembership};

use super::types::SpaceRecord;

#[derive(Clone)]
pub struct DefaultSpaceManager {
    pub(super) repos: Arc<dyn RepositoryProvider>,
    pub(super) signer: Keypair,
    pub(super) peer_id: PeerId,
}

impl DefaultSpaceManager {
    pub fn new(repos: Arc<dyn RepositoryProvider>, signer: Keypair, peer_id: PeerId) -> Self {
        Self {
            repos,
            signer,
            peer_id,
        }
    }

    pub(super) fn normalize_display_name(name: Option<String>) -> Option<String> {
        let Some(name) = name else { return None };
        let trimmed = name.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    }

    pub(super) fn record(&self, space: soma_storage::membership::Space) -> SpaceRecord {
        SpaceRecord {
            space_id: space.space_id,
            display_name: space.display_name,
            owner_peer_id: space.owner_peer_id,
            created_at: space.created_at,
        }
    }

    pub(super) async fn require_owned_space(
        &self,
        space_id: &str,
        owner_error: &'static str,
    ) -> SomaResult<soma_storage::membership::Space> {
        let repo = self.repos.membership_repo();
        let space = repo
            .get_space(space_id)
            .await?
            .ok_or_else(|| Error::service("space not found"))?;
        if !self.owns_space(&space) {
            return Err(Error::service(owner_error));
        }
        Ok(space)
    }

    pub(super) fn owns_space(&self, space: &soma_storage::membership::Space) -> bool {
        space
            .owner_peer_id
            .as_ref()
            .map(|owner| owner == &self.peer_id.to_string())
            .unwrap_or(false)
    }

    pub(super) async fn ensure_owner_membership(
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

    pub(super) fn now_secs() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64
    }
}
