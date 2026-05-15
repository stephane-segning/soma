use libp2p::PeerId;
use soma_storage::membership::{MembershipRepository, Space, SpaceMembership};
use tracing::warn;

pub(crate) async fn persist_membership(
    repo: &dyn MembershipRepository,
    space_id: &str,
    subject_peer_id: &str,
    issuer: &PeerId,
    role: &str,
    issued_at: i64,
    capability: Vec<u8>,
) {
    if let Err(err) = repo
        .upsert_space(&Space {
            space_id: space_id.to_string(),
            display_name: None,
            owner_peer_id: None,
            created_at: issued_at,
        })
        .await
    {
        warn!(%err, "failed to upsert space while processing join");
    }

    if let Err(err) = repo
        .upsert_membership(&SpaceMembership {
            space_id: space_id.to_string(),
            subject_peer_id: subject_peer_id.to_string(),
            role: role.to_string(),
            issuer_peer_id: issuer.to_string(),
            issued_at,
            expires_at: None,
            capability: Some(capability),
        })
        .await
    {
        warn!(%err, "failed to upsert membership while processing join");
    }
}
