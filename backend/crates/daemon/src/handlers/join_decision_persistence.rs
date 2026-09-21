use async_trait::async_trait;
use libp2p::PeerId;
use libp2p::identity::PublicKey;
use soma_membership::{PeerKeyResolver, verify_and_apply_inbound_join_decision};
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

        // All verification (correlation against our own outgoing
        // join_requests, trust-anchor binding, signature + delegation
        // chain) happens inside `soma_membership`. This handler owns only
        // resolving peer public keys (daemon-specific: in-memory Identify
        // cache + persisted fallback) and applying the outcome.
        let resolver = DaemonPeerKeyResolver(ctx);
        let repo = ctx.repos.membership_repo();
        if let Err(err) = verify_and_apply_inbound_join_decision(
            repo.as_ref(),
            &resolver,
            from,
            &ctx.peer_id,
            decision,
        )
        .await
        {
            warn!(%err, peer = %from, "rejected inbound join decision");
        }
    }
}

/// Resolves a peer's authenticated public key from the daemon's in-memory
/// Identify cache, falling back to the persisted `peer_public_keys` table.
/// `soma_membership::verify_and_apply_inbound_join_decision` treats a
/// `None` here as a verification failure — see its doc comment and
/// `PeerKeyResolver`'s.
struct DaemonPeerKeyResolver<'a>(&'a DaemonState);

#[async_trait]
impl PeerKeyResolver for DaemonPeerKeyResolver<'_> {
    async fn resolve(&self, peer: &PeerId) -> Option<PublicKey> {
        peer_public_key(self.0, peer).await
    }
}

async fn peer_public_key(ctx: &DaemonState, peer: &PeerId) -> Option<PublicKey> {
    let cached = {
        let map = ctx.identify_keys.lock().await;
        map.get(peer).cloned()
    };
    if cached.is_some() {
        return cached;
    }

    // Previously used `.now_or_never()` here, which only returns `Some`
    // if the query future happens to resolve synchronously on first
    // poll — for a real SQL query against a real database that is
    // essentially never true, making this fallback silently dead in
    // practice. Properly `.await`ing it is what actually makes the
    // fallback (and therefore verification of a peer we haven't recently
    // Identify'd but have seen before) work.
    ctx.repos
        .peer_keys_repo()
        .get(&peer.to_string())
        .await
        .ok()
        .flatten()
        .and_then(|row| PublicKey::try_decode_protobuf(&row.public_key).ok())
}
