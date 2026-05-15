use std::time::SystemTime;

use async_trait::async_trait;
use futures::FutureExt;
use libp2p::PeerId;
use soma_common::{verify_issuer_capability, verify_membership_capability};
use soma_membership::apply_join_decision;
use soma_peer::PeerEvent;
use soma_peer::events::{PeerEventHandler, PeerEventKind};
use tracing::warn;

use crate::grpc::DaemonState;

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
        if let Err(err) =
            verify_membership_capability(cap, &pubkey, &ctx.peer_id, SystemTime::now())
        {
            warn!(%err, peer = %from, "rejected join decision: capability verification failed");
            return;
        }

        if !verify_delegated_issuer(ctx, from, cap, &pubkey).await {
            return;
        }

        if let Err(err) = apply_join_decision(&ctx.repos, decision).await {
            warn!(%err, "failed to apply join decision");
        }
    }
}

async fn verify_delegated_issuer(
    ctx: &DaemonState,
    from: &PeerId,
    cap: &soma_proto_build::space::MembershipCapability,
    pubkey: &libp2p::identity::PublicKey,
) -> bool {
    let Some(issuer_cap) = cap.issuer_cap.as_ref() else {
        return true;
    };
    let owner_peer = issuer_cap
        .owner_peer_id
        .as_ref()
        .map(|p| p.value.clone())
        .unwrap_or_default();
    let now = SystemTime::now();

    if owner_peer == from.to_string() {
        if let Err(err) = verify_issuer_capability(issuer_cap, pubkey, now) {
            warn!(%err, peer = %from, "rejected join decision: issuer capability invalid");
            return false;
        }
        return true;
    }

    let Ok(owner_id) = owner_peer.parse::<PeerId>() else {
        warn!(peer = %from, owner_peer, "rejected join decision: malformed owner peer id");
        return false;
    };
    let Some(owner_pk) = peer_public_key(ctx, &owner_id).await else {
        warn!(
            peer = %from,
            owner = %owner_peer,
            "rejected join decision: owner pubkey unavailable for issuer verification"
        );
        return false;
    };
    if let Err(err) = verify_issuer_capability(issuer_cap, &owner_pk, now) {
        warn!(%err, peer = %from, owner = %owner_peer, "rejected join decision: issuer delegation invalid");
        return false;
    }
    true
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
