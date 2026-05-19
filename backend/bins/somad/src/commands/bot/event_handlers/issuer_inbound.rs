//! Bot-host handler for `PeerEvent::IssuerOfferReceived`.
//!
//! When the desktop owner issues a bot capability to this peer, the
//! codec layer auto-ACKs and emits this event. We persist the signed
//! capability into `issuer_capabilities` so the membership crate's
//! join-decider can later use it for auto-approval — without this,
//! the owner sees `active` on their side but the bot can't actually
//! issue memberships against the delegation.
use std::time::SystemTime;

use async_trait::async_trait;
use prost::Message;
use soma_membership::bot_status;
use soma_peer::PeerEvent;
use soma_peer::events::{PeerEventHandler, PeerEventKind};
use soma_storage::issuer::{IssuerCapability as StoredIssuerCapability, IssuerRepository};
use tracing::warn;

use crate::commands::bot::http::BotState;

pub struct IssuerInboundHandler;

#[async_trait]
impl PeerEventHandler<BotState> for IssuerInboundHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[PeerEventKind::IssuerOfferReceived]
    }

    async fn handle(&self, ctx: &BotState, evt: &PeerEvent) {
        let PeerEvent::IssuerOfferReceived {
            from, capability, ..
        } = evt
        else {
            return;
        };

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

        let row = StoredIssuerCapability {
            space_id,
            issuer_peer_id: capability
                .owner_peer_id
                .as_ref()
                .map(|p| p.value.clone())
                .unwrap_or_else(|| from.to_string()),
            delegate_peer_id: ctx.peer_id.to_string(),
            issued_at,
            expires_at: capability.expires_at.as_ref().map(|ts| ts.seconds),
            capability: Some(capability.encode_to_vec()),
            alias: None,
            status: bot_status::ACTIVE.to_string(),
        };

        if let Err(err) = ctx.repos.issuer().upsert(&row).await {
            warn!(?err, %from, "failed to persist inbound issuer capability");
        }
    }
}
