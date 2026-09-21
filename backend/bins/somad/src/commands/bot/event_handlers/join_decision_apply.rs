use async_trait::async_trait;
use libp2p::PeerId;
use libp2p::identity::PublicKey;
use soma_membership::{PeerKeyResolver, verify_and_apply_inbound_join_decision};
use soma_peer::{
    PeerEvent,
    events::{PeerEventHandler, PeerEventKind},
};
use soma_storage::peers::PeerPublicKeyRepository;
use tracing::warn;

use crate::commands::bot::http::BotState;

/// Verifies and applies accepted join decisions to local storage
/// (requester side).
pub(super) struct JoinDecisionApplyHandler;

#[async_trait]
impl PeerEventHandler<BotState> for JoinDecisionApplyHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[PeerEventKind::JoinDecision]
    }

    async fn handle(&self, ctx: &BotState, evt: &PeerEvent) {
        let PeerEvent::JoinDecision { from, decision } = evt else {
            return;
        };

        // Ignore decisions we generated locally (decider path).
        if *from == ctx.peer_id {
            return;
        }

        // Ignore placeholder "pending manual approval" responses.
        if decision.decision_id.starts_with("reject-pending") {
            return;
        }

        // All verification (correlation against our own outgoing
        // join_requests, trust-anchor binding, signature + delegation
        // chain) happens inside `soma_membership`. This handler owns only
        // resolving peer public keys and applying the outcome. Previously
        // this called `apply_join_decision` directly with NO verification
        // at all.
        let resolver = BotPeerKeyResolver(ctx);
        if let Err(err) = verify_and_apply_inbound_join_decision(
            &ctx.repos.membership(),
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

/// Resolves a peer's authenticated public key from the bot's persisted
/// `peer_public_keys` table — populated from libp2p Identify by
/// `event_handlers::identify_store::IdentifyStorePersistHandler` (see the
/// identically-named resolver in `issuer_inbound.rs`). A decision from a
/// peer the bot has no key on file for (Identify hasn't happened yet, or
/// failed) is correctly rejected — `PeerKeyResolver`'s contract treats
/// `None` as a verification failure, never a default-allow.
struct BotPeerKeyResolver<'a>(&'a BotState);

#[async_trait]
impl PeerKeyResolver for BotPeerKeyResolver<'_> {
    async fn resolve(&self, peer: &PeerId) -> Option<PublicKey> {
        self.0
            .repos
            .peer_keys()
            .get(&peer.to_string())
            .await
            .ok()
            .flatten()
            .and_then(|row| PublicKey::try_decode_protobuf(&row.public_key).ok())
    }
}
