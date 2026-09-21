use crate::PeerCommand;
use crate::codec::BlobAnnounce;
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
        PeerCommand::SendIssuerOffer {
            target,
            addrs,
            delivery_id,
            space_id,
            capability,
        } => {
            for addr in addrs {
                state.swarm.add_peer_address(target, addr.clone());
                let _ = state.swarm.dial(addr.clone());
            }
            let req_id = state
                .swarm
                .behaviour_mut()
                .issuer_offer
                .send_request(&target, capability);
            state
                .outbound_issuer_offers
                .insert(req_id, (target, delivery_id, space_id));
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
        PeerCommand::AnnounceBlob {
            space_id,
            cid,
            mime,
            size,
        } => {
            let announce = BlobAnnounce {
                space_id,
                cid,
                mime,
                size,
            };
            // Fan out to every currently connected peer. Not space-scoped:
            // the announce is only a hint (space_id + cid + mime + size),
            // and the actual bytes stay gated by `SpaceAuthorizer` on
            // fetch — see AGENTS.md's "Blobs" section. A peer outside the
            // space can see the hint but can't fetch the bytes.
            let peers: Vec<_> = state.swarm.connected_peers().copied().collect();
            for peer in peers {
                let _ = state
                    .swarm
                    .behaviour_mut()
                    .blob_announce
                    .send_request(&peer, announce.clone());
            }
        }
        PeerCommand::Shutdown => {
            info!("peer shutdown requested");
            return true;
        }
    }

    false
}
