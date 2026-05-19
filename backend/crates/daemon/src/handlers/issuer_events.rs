//! Daemon-side handler for `PeerEvent::IssuerOffer*` events.
//!
//! Owner side of the handshake: when the peer runtime emits an ACK we
//! transition the persistent bot row to `active`. When it emits a
//! delivery failure (timeout, no route to peer, codec error) we
//! transition to `failed`. In both cases we publish a
//! `BotStatusChangedEvent` so the renderer's Bots tab refreshes.
//!
//! Delegate side: when an inbound offer arrives, persist the signed
//! capability so the bot can use it later — e.g. for
//! `load_issuer_capability` in the membership crate's join-decider
//! auto-approval path. The codec auto-ACKs synchronously; this handler
//! runs asynchronously after the ACK has gone out, so there's a small
//! window where the owner sees `active` before the bot has stored the
//! row. Operator recourse on storage failure is the same as for any
//! handshake failure: re-issue.
use async_trait::async_trait;
use prost::Message;
use soma_membership::bot_status;
use soma_peer::PeerEvent;
use soma_peer::events::{PeerEventHandler, PeerEventKind};
use soma_proto_build::daemon;
use soma_storage::issuer::IssuerCapability as StoredIssuerCapability;
use std::time::SystemTime;
use tracing::warn;

use crate::state::DaemonState;

pub struct IssuerEventsHandler;

#[async_trait]
impl PeerEventHandler<DaemonState> for IssuerEventsHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[
            PeerEventKind::IssuerOfferAckReceived,
            PeerEventKind::IssuerOfferDeliveryFailed,
            PeerEventKind::IssuerOfferReceived,
        ]
    }

    async fn handle(&self, ctx: &DaemonState, event: &PeerEvent) {
        // Inbound offer (delegate side): persist the capability so
        // the bot can later issue memberships against it.
        if let PeerEvent::IssuerOfferReceived {
            from, capability, ..
        } = event
        {
            persist_inbound_capability(ctx, from, capability).await;
            return;
        }

        // Outbound ack / failure (owner side): transition the
        // persistent status of the in-flight bot row.
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
        // unchanged across the transition. `0` rows affected means
        // either (a) the operator deleted the bot before the ACK
        // arrived or (b) the row's status was no longer `pending`
        // (e.g. a stale event from a superseded re-issuance —
        // `update_status` only flips rows currently in `pending`).
        // Skip the broadcast in both cases.
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

async fn persist_inbound_capability(
    ctx: &DaemonState,
    from: &libp2p::PeerId,
    capability: &soma_proto_build::space::IssuerCapability,
) {
    let space_id = capability
        .space_id
        .as_ref()
        .map(|s| s.value.clone())
        .unwrap_or_default();
    if space_id.is_empty() {
        warn!("inbound issuer offer missing space_id; skipping persistence");
        return;
    }

    let issued_at = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default();
    let expires_at = capability.expires_at.as_ref().map(|ts| ts.seconds);

    let row = StoredIssuerCapability {
        space_id,
        // The on-wire `issuer_peer_id` is the delegate (us); the
        // signer is the owner, carried inside `signed.signer_peer_id`.
        // For the storage row's `issuer_peer_id` field we want the
        // owner identity — match what the owner-side write does in
        // `membership::issue_issuer_capability_to_storage`.
        issuer_peer_id: capability
            .owner_peer_id
            .as_ref()
            .map(|p| p.value.clone())
            .unwrap_or_else(|| from.to_string()),
        delegate_peer_id: ctx.peer_id.to_string(),
        issued_at,
        expires_at,
        capability: Some(capability.encode_to_vec()),
        // Bot side has no operator-typed alias; the owner's `alias`
        // is local UI state on the issuer.
        alias: None,
        // We trust libp2p source-peer auth + the capability's
        // owner-signature for v0; the row lands as `active` so the
        // join-decider auto-approval path can find it immediately.
        status: bot_status::ACTIVE.to_string(),
    };

    if let Err(err) = ctx.repos.issuer_repo().upsert(&row).await {
        warn!(?err, %from, "failed to persist inbound issuer capability");
    }
}
