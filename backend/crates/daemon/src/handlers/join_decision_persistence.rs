use std::time::SystemTime;

use async_trait::async_trait;
use futures::FutureExt;
use libp2p::PeerId;
use soma_common::{verify_membership_capability, verify_membership_capability_with_owner_key};
use soma_membership::apply_join_decision;
use soma_peer::PeerEvent;
use soma_peer::events::{PeerEventHandler, PeerEventKind};
use tracing::warn;

use crate::state::DaemonState;

pub struct JoinDecisionPersistenceHandler;

#[async_trait]
impl PeerEventHandler<DaemonState> for JoinDecisionPersistenceHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[PeerEventKind::JoinDecision]
    }

    async fn handle(&self, ctx: &DaemonState, event: &PeerEvent) {
        let PeerEvent::JoinDecision { from, decision } = event else {
            return;
        };
        if *from == ctx.peer_id || decision.decision_id.starts_with("reject-pending") {
            return;
        }

        let Some(cap) = decision.capability.as_ref() else {
            warn!(peer = %from, "rejected join decision: missing capability");
            return;
        };

        let Some(pubkey) = peer_public_key(ctx, from).await else {
            warn!(peer = %from, "rejected join decision: missing sender public key");
            return;
        };
        let verification = if cap.issuer_cap.is_some() {
            let Some(owner_pk) = issuer_owner_public_key(ctx, from, cap).await else {
                return;
            };
            verify_membership_capability_with_owner_key(
                cap,
                &pubkey,
                &owner_pk,
                &ctx.peer_id,
                SystemTime::now(),
            )
        } else {
            verify_membership_capability(cap, &pubkey, &ctx.peer_id, SystemTime::now())
        };
        if let Err(err) = verification {
            warn!(%err, peer = %from, "rejected join decision: capability verification failed");
            return;
        }

        if let Err(err) = apply_join_decision(&ctx.repos, decision).await {
            warn!(%err, "failed to apply join decision");
        }
    }
}

async fn issuer_owner_public_key(
    ctx: &DaemonState,
    from: &PeerId,
    cap: &soma_proto_build::space::MembershipCapability,
) -> Option<libp2p::identity::PublicKey> {
    let Some(issuer_cap) = cap.issuer_cap.as_ref() else {
        return None;
    };
    let owner_peer = issuer_cap
        .owner_peer_id
        .as_ref()
        .map(|p| p.value.clone())
        .unwrap_or_default();

    if owner_peer == from.to_string() {
        return peer_public_key(ctx, from).await;
    }

    let Ok(owner_id) = owner_peer.parse::<PeerId>() else {
        warn!(peer = %from, owner_peer, "rejected join decision: malformed owner peer id");
        return None;
    };
    let Some(owner_pk) = peer_public_key(ctx, &owner_id).await else {
        warn!(
            peer = %from,
            owner = %owner_peer,
            "rejected join decision: owner pubkey unavailable for issuer verification"
        );
        return None;
    };
    Some(owner_pk)
}

async fn peer_public_key(ctx: &DaemonState, peer: &PeerId) -> Option<libp2p::identity::PublicKey> {
    let cached = {
        let map = ctx.identify_keys.lock().await;
        map.get(peer).cloned()
    };
    cached.or_else(|| {
        ctx.repos
            .peer_keys_repo()
            .get(&peer.to_string())
            .now_or_never()
            .and_then(|res| res.ok().flatten())
            .and_then(|row| libp2p::identity::PublicKey::try_decode_protobuf(&row.public_key).ok())
    })
}
