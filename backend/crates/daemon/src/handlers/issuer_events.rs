//! Daemon-side handler for `PeerEvent::IssuerOffer*` events.
//!
//! Owner side of the handshake: when the peer runtime emits an ACK we
//! transition the persistent bot row to `active`. When it emits a
//! delivery failure (timeout, no route to peer, codec error) we
//! transition to `failed`. In both cases we publish a
//! `BotStatusChangedEvent` so the renderer's Bots tab refreshes.
//!
//! Delegate side is observability-only here — the codec layer
//! auto-ACKs and the daemon just logs through `LoggingHandler`.
use async_trait::async_trait;
use soma_membership::bot_status;
use soma_peer::PeerEvent;
use soma_peer::events::{PeerEventHandler, PeerEventKind};
use soma_proto_build::daemon;
use tracing::warn;

use crate::state::DaemonState;

pub struct IssuerEventsHandler;

#[async_trait]
impl PeerEventHandler<DaemonState> for IssuerEventsHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[
            PeerEventKind::IssuerOfferAckReceived,
            PeerEventKind::IssuerOfferDeliveryFailed,
        ]
    }

    async fn handle(&self, ctx: &DaemonState, event: &PeerEvent) {
        let (space_id, delegate_peer_id, next_status) = match event {
            PeerEvent::IssuerOfferAckReceived {
                target,
                space_id,
                ..
            } => (space_id.clone(), target.to_string(), bot_status::ACTIVE),
            PeerEvent::IssuerOfferDeliveryFailed {
                target,
                space_id,
                error,
                ..
            } => {
                warn!(?error, %target, %space_id, "issuer offer delivery failed");
                (space_id.clone(), target.to_string(), bot_status::FAILED)
            }
            _ => return,
        };

        // Update only the status column — the signed capability bytes
        // and the (space_id, delegate_peer_id) primary key are
        // unchanged across the transition. `0` rows affected means the
        // operator deleted the bot before the ACK arrived; nothing to
        // do.
        let rows = ctx
            .repos
            .issuer_repo()
            .update_status(&space_id, &delegate_peer_id, next_status)
            .await;
        if let Err(err) = &rows {
            warn!(?err, %space_id, %delegate_peer_id, "failed to persist bot status transition");
            return;
        }
        if rows.ok() == Some(0) {
            // Row was deleted between issuance and ACK. Skip the
            // status-changed broadcast.
            return;
        }

        ctx.publish(daemon::DaemonEvent {
            event: Some(daemon::daemon_event::Event::BotStatusChanged(
                daemon::BotStatusChangedEvent {
                    space_id,
                    delegate_peer_id,
                    status: next_status.to_string(),
                },
            )),
        })
        .await;
    }
}
