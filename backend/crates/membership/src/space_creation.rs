use std::time::SystemTime;

use libp2p::PeerId;
use soma_core::SomaResult;
use soma_storage::{RepositoryProvider, membership::Space};

use crate::time::epoch_seconds;

pub async fn create_space(
    repos: &dyn RepositoryProvider,
    owner_peer_id: &PeerId,
    space_id: &str,
    display_name: Option<String>,
) -> SomaResult<()> {
    repos
        .membership_repo()
        .upsert_space(&Space {
            space_id: space_id.to_string(),
            display_name,
            owner_peer_id: Some(owner_peer_id.to_string()),
            created_at: epoch_seconds(SystemTime::now()),
        })
        .await
}
