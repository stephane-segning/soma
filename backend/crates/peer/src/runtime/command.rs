use crate::PeerCommand;
use crate::protocol::BLOB_CHUNK_BYTES;
use crate::runtime::RuntimeState;
use soma_vdfs::BlobRequest;
use tracing::{info, warn};

pub(super) async fn handle_command(state: &mut RuntimeState, cmd: PeerCommand) -> bool {
    match cmd {
        PeerCommand::Dial(addr) | PeerCommand::AddBootstrap(addr) => {
            if let Err(err) = state.swarm.dial(addr.clone()) {
                warn!(?err, ?addr, "failed to dial requested addr");
            }
        }
        PeerCommand::SendJoinRequest {
            target,
            addrs,
            delivery_id,
            request_id,
            request,
        } => {
            for addr in addrs {
                state.swarm.add_peer_address(target, addr.clone());
                let _ = state.swarm.dial(addr.clone());
            }
            let req_id = state
                .swarm
                .behaviour_mut()
                .join
                .send_request(&target, request);
            state
                .outbound_join_requests
                .insert(req_id, (target, delivery_id.clone(), request_id.clone()));
            let _ = state
                .event_tx
                .try_send(crate::PeerEvent::JoinRequestSubmitted {
                    target,
                    request_id: request_id.clone(),
                });
            let _ = state
                .event_tx
                .try_send(crate::PeerEvent::JoinRequestDeliverySubmitted {
                    target,
                    delivery_id,
                    request_id,
                });
        }
        PeerCommand::SendJoinDecision {
            target,
            addrs,
            delivery_id,
            decision,
        } => {
            for addr in addrs {
                state.swarm.add_peer_address(target, addr.clone());
                let _ = state.swarm.dial(addr.clone());
            }
            let req_id = state
                .swarm
                .behaviour_mut()
                .join_decision
                .send_request(&target, decision);
            state
                .outbound_join_decisions
                .insert(req_id, (target, delivery_id.clone()));
            let _ = state
                .event_tx
                .try_send(crate::PeerEvent::JoinDecisionDeliverySubmitted {
                    target,
                    delivery_id,
                });
        }
        PeerCommand::FetchBlob {
            target,
            addrs,
            cid,
            space_id,
        } => {
            for addr in addrs {
                state.swarm.add_peer_address(target, addr.clone());
                let _ = state.swarm.dial(addr.clone());
            }
            let request = BlobRequest {
                cid,
                space_id: space_id.unwrap_or_default(),
                offset: 0,
                length: BLOB_CHUNK_BYTES as u32,
            };
            let _ = state
                .swarm
                .behaviour_mut()
                .blob
                .send_request(&target, request);
        }
        PeerCommand::Shutdown => {
            info!("peer shutdown requested");
            return true;
        }
    }

    false
}
