//! Daemon-side handler for `PeerEvent::IssuerOffer*` events.
//!
//! Owner side of the handshake: when the peer runtime emits an ACK we
//! transition the persistent bot row to `active`. When it emits a
//! delivery failure (timeout, no route to peer, codec error) we
//! transition to `failed`. In both cases we publish a
//! `BotStatusChangedEvent` so the renderer's Bots tab refreshes.
//!
//! Delegate side: when an inbound offer arrives, verify it
//! (`soma_membership::verify_inbound_issuer_capability` — real signature
//! verification against a locally-pinned trust anchor, not just "the
//! sender says so") and persist the signed capability so the bot can use
//! it later — e.g. for `load_issuer_capability` in the membership crate's
//! join-decider auto-approval path. The codec auto-ACKs synchronously;
//! this handler runs asynchronously after the ACK has gone out, so
//! there's a small window where the owner sees `active` before the bot
//! has stored the row. Operator recourse on storage failure, OR on
//! verification failure, is the same as for any handshake failure:
//! re-issue.
use async_trait::async_trait;
use libp2p::PeerId;
use libp2p::identity::PublicKey;
use prost::Message;
use soma_membership::{PeerKeyResolver, bot_status, scopes::SCOPE_PENDING_REVIEW};
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
        // Inbound offer (delegate side): verify, then persist the
        // capability so the bot can later issue memberships against it.
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
                target, space_id, ..
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
    from: &PeerId,
    capability: &soma_proto_build::space::IssuerCapability,
) {
    let resolver = DaemonPeerKeyResolver(ctx);
    let repo = ctx.repos.membership_repo();
    let (anchor, owner_pub) = match soma_membership::verify_inbound_issuer_capability(
        repo.as_ref(),
        &resolver,
        from,
        capability,
    )
    .await
    {
        Ok(result) => result,
        Err(err) => {
            warn!(%err, %from, "rejected inbound issuer capability");
            return;
        }
    };

    // Cache the now-verified owner key (in memory and durably) so later
    // re-verification (auto/manual join-approval — see
    // `soma_membership::issuer::issuer_capability_signature_ok`) doesn't
    // depend on a fresh Identify from the owner, who may not stay
    // connected.
    {
        let mut map = ctx.identify_keys.lock().await;
        map.insert(anchor.peer_id(), owner_pub.clone());
    }
    let issued_at = now_secs();
    let _ = ctx
        .repos
        .peer_keys_repo()
        .upsert(
            &anchor.peer_id().to_string(),
            &owner_pub.encode_protobuf(),
            issued_at,
        )
        .await;

    let space_id = capability
        .space_id
        .as_ref()
        .map(|s| s.value.clone())
        .unwrap_or_default();
    let expires_at = capability.expires_at.as_ref().map(|ts| ts.seconds);

    let row = StoredIssuerCapability {
        space_id,
        // Verified above, rather than trusted from the payload: the
        // owner identity is `anchor`, which `verify_inbound_issuer_capability`
        // has already confirmed matches both the offer's own claim and
        // (if one was already pinned) this space's locally-pinned owner.
        issuer_peer_id: anchor.peer_id().to_string(),
        delegate_peer_id: ctx.peer_id.to_string(),
        issued_at,
        expires_at,
        capability: Some(capability.encode_to_vec()),
        // Bot side has no operator-typed alias; the owner's `alias`
        // is local UI state on the issuer.
        alias: None,
        // Verified above via a real signature check against the space's
        // trust-anchored owner (`soma_common::verify_issuer_capability`),
        // so it's safe to activate immediately — this is what the
        // comment here always *claimed* pre-fix, but the code never
        // actually verified anything.
        status: bot_status::ACTIVE.to_string(),
        // Fail closed (membership-forgery fix, item 6): a capability that
        // just arrived over the wire has had NO local operator review, so
        // it must NOT inherit the "empty means unrestricted" meaning
        // reserved for genuinely pre-#92, LOCALLY owner-authored rows
        // (see `soma_membership::scopes`). An operator can explicitly
        // grant `issue:membership` afterwards through the normal local
        // issuance UI/API once they've reviewed this delegation.
        scopes: vec![SCOPE_PENDING_REVIEW.to_string()],
    };

    if let Err(err) = ctx.repos.issuer_repo().upsert(&row).await {
        warn!(?err, %from, "failed to persist inbound issuer capability");
    }
}

/// Resolves a peer's authenticated public key from the daemon's in-memory
/// Identify cache, falling back to the persisted `peer_public_keys` table.
/// Duplicated (rather than shared) with the identically-named resolver in
/// `join_decision_persistence.rs`: both files are independently owned
/// hardening changes for this fix, and the natural shared home for a
/// single copy (`handlers/mod.rs` or `state.rs`) is outside this fix's
/// file-ownership boundary.
struct DaemonPeerKeyResolver<'a>(&'a DaemonState);

#[async_trait]
impl PeerKeyResolver for DaemonPeerKeyResolver<'_> {
    async fn resolve(&self, peer: &PeerId) -> Option<PublicKey> {
        let cached = {
            let map = self.0.identify_keys.lock().await;
            map.get(peer).cloned()
        };
        if cached.is_some() {
            return cached;
        }
        self.0
            .repos
            .peer_keys_repo()
            .get(&peer.to_string())
            .await
            .ok()
            .flatten()
            .and_then(|row| PublicKey::try_decode_protobuf(&row.public_key).ok())
    }
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
