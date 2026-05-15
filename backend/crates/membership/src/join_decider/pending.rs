use libp2p::PeerId;
use prost::Message;
use soma_proto_build::space::{JoinRequest, SpaceId};
use soma_storage::membership::{JoinRequest as StoredJoinRequest, MembershipRepository};
use tracing::warn;

pub(super) async fn record_pending_request(
    repo: &dyn MembershipRepository,
    local_peer_id: &PeerId,
    request: &JoinRequest,
    space_id: &SpaceId,
    subject_peer_id: &soma_proto_build::space::PeerId,
    now_secs: i64,
) {
    let request_id = format!("req-{:016x}", rand::random::<u64>());
    if let Err(err) = repo
        .upsert_join_request(&StoredJoinRequest {
            request_id: request_id.clone(),
            space_id: space_id.value.clone(),
            subject_peer_id: subject_peer_id.value.clone(),
            display_name: request.display_name.clone(),
            device_name: request.device_name.clone(),
            requested_role: request.requested_role,
            created_at: now_secs,
            payload: Some(request.encode_to_vec()),
            target_peer_id: Some(local_peer_id.to_string()),
            status: "pending".into(),
            attempts: 0,
            next_attempt_at: 0,
            last_error: None,
            is_outgoing: false,
        })
        .await
    {
        warn!(%err, %request_id, "failed to persist join request");
    }
}
