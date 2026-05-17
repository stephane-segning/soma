use async_trait::async_trait;
use soma_peer::{
    PeerEvent,
    events::{PeerEventHandler, PeerEventKind},
};
use soma_storage::RepositoryProvider;

use crate::commands::bot::http::BotState;

pub(super) struct MailboxOutboxHandler;

#[async_trait]
impl PeerEventHandler<BotState> for MailboxOutboxHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[
            PeerEventKind::ConnectionEstablished,
            PeerEventKind::JoinRequestDeliveryAck,
            PeerEventKind::JoinRequestDeliveryFailed,
            PeerEventKind::JoinDecisionDeliveryAck,
            PeerEventKind::JoinDecisionDeliveryFailed,
        ]
    }

    async fn handle(&self, ctx: &BotState, evt: &PeerEvent) {
        match evt {
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
            PeerEvent::YooptaBlobAdded { .. } => {
                // Mirror bots could enqueue fetch here once blob protocols are wired.
            }
            _ => {}
        }
    }
}
