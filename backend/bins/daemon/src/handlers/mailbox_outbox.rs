use async_trait::async_trait;
use soma_peer::PeerEvent;
use soma_peer::events::{PeerEventHandler, PeerEventKind};

use crate::grpc::DaemonState;

pub struct MailboxOutboxHandler;

#[async_trait]
impl PeerEventHandler<DaemonState> for MailboxOutboxHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[
            PeerEventKind::ConnectionEstablished,
            PeerEventKind::JoinRequestDeliveryAck,
            PeerEventKind::JoinRequestDeliveryFailed,
            PeerEventKind::JoinDecisionDeliveryAck,
            PeerEventKind::JoinDecisionDeliveryFailed,
        ]
    }

    async fn handle(&self, ctx: &DaemonState, event: &PeerEvent) {
        match event {
            PeerEvent::ConnectionEstablished { peer } => {
                soma_membership::outbox::deliver_for_peer(
                    &ctx.repos,
                    &ctx.peer_id,
                    &ctx.peer_commands,
                    peer,
                )
                .await;
            }
            PeerEvent::JoinRequestDeliveryAck { delivery_id, .. } => {
                let _ = ctx.repos.mailbox_repo().mark_done(delivery_id).await;
            }
            PeerEvent::JoinRequestDeliveryFailed { delivery_id, .. } => {
                soma_membership::outbox::requeue_or_dead(&ctx.repos, delivery_id).await;
            }
            PeerEvent::JoinDecisionDeliveryAck { delivery_id, .. } => {
                let _ = ctx.repos.mailbox_repo().mark_done(delivery_id).await;
            }
            PeerEvent::JoinDecisionDeliveryFailed { delivery_id, .. } => {
                soma_membership::outbox::requeue_or_dead(&ctx.repos, delivery_id).await;
            }
            _ => {}
        }
    }
}
