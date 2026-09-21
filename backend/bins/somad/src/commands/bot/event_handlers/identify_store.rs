//! Bot-side handler that persists libp2p Identify-observed public keys.
//!
//! Mirrors `soma_daemon::handlers::IdentifyStoreHandler` exactly (see that
//! file) — `somad bot` previously had no equivalent, which left
//! `BotPeerKeyResolver` in `issuer_inbound.rs` permanently empty for any
//! peer the bot had not separately learned a key for some other way. That
//! meant a brand-new owner's first-ever issuer offer could never verify:
//! `verify_inbound_issuer_capability` fails closed (correctly) when the
//! resolver returns `None`, and the only write to `peer_public_keys` on
//! the old code path ran *after* verification already succeeded, so it
//! could never bootstrap itself. Registering this handler for
//! `PeerEventKind::IdentifyReceived` (in `event_handlers.rs`'s
//! `build_handlers()`) closes that gap: by the time an `IssuerOfferReceived`
//! event arrives, the sender's key is already on file from the libp2p
//! Identify exchange that happens as connections are established, well
//! before any application-level offer is sent.
//!
//! No in-memory cache here (unlike the daemon's `identify_keys: Mutex<HashMap<..>>`
//! on `DaemonState`) — `BotState` carries none, and every resolver on the
//! bot side (`issuer_inbound.rs`, `join_decision_apply.rs`) already reads
//! straight from the persisted `peer_public_keys` table. Adding an
//! in-memory cache here without a resolver that ever consults it would be
//! dead weight.
use std::time::SystemTime;

use async_trait::async_trait;
use soma_peer::PeerEvent;
use soma_peer::events::{PeerEventHandler, PeerEventKind};
use soma_storage::peers::PeerPublicKeyRepository;
use tracing::warn;

use crate::commands::bot::http::BotState;

pub struct IdentifyStorePersistHandler;

#[async_trait]
impl PeerEventHandler<BotState> for IdentifyStorePersistHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[PeerEventKind::IdentifyReceived]
    }

    async fn handle(&self, ctx: &BotState, event: &PeerEvent) {
        let PeerEvent::IdentifyReceived {
            peer, public_key, ..
        } = event
        else {
            return;
        };

        let Some(pk) = public_key else { return };

        if let Err(err) = ctx
            .repos
            .peer_keys()
            .upsert(&peer.to_string(), &pk.encode_protobuf(), now_secs())
            .await
        {
            warn!(%err, %peer, "failed to persist identify-observed peer key");
        }
    }
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::bot::event_handlers::test_support::{test_repos, test_state};
    use libp2p::PeerId;
    use libp2p::identity::Keypair;

    /// The bootstrap gap this handler closes: before this fix, nothing on
    /// the bot side populated `peer_public_keys` from Identify at all, so
    /// a peer the bot has never verified anything from yet had no row —
    /// this proves that gap is closed by the handler alone (independent
    /// of any issuer-offer flow).
    #[tokio::test]
    async fn identify_received_persists_the_public_key() {
        let (_dir, repos) = test_repos().await;
        let bot_key = Keypair::generate_ed25519();
        let bot_peer = bot_key.public().to_peer_id();
        let (state, _rx) = test_state(repos, bot_peer, bot_key);

        let owner_key = Keypair::generate_ed25519();
        let owner_peer = owner_key.public().to_peer_id();

        assert!(
            state
                .repos
                .peer_keys()
                .get(&owner_peer.to_string())
                .await
                .expect("get")
                .is_none(),
            "precondition: no key on file yet for a peer we've never Identify'd"
        );

        let handler = IdentifyStorePersistHandler;
        handler
            .handle(
                &state,
                &PeerEvent::IdentifyReceived {
                    peer: owner_peer,
                    agent: "soma/test".into(),
                    protocols: 3,
                    public_key: Some(owner_key.public()),
                },
            )
            .await;

        let stored = state
            .repos
            .peer_keys()
            .get(&owner_peer.to_string())
            .await
            .expect("get")
            .expect("key must be persisted after IdentifyReceived");
        assert_eq!(stored.public_key, owner_key.public().encode_protobuf());
    }

    /// A well-formed `IdentifyReceived` with no public key (some transports
    /// / configurations can omit it) must not panic or write a bogus row.
    #[tokio::test]
    async fn identify_received_without_a_public_key_is_a_noop() {
        let (_dir, repos) = test_repos().await;
        let bot_key = Keypair::generate_ed25519();
        let bot_peer = bot_key.public().to_peer_id();
        let (state, _rx) = test_state(repos, bot_peer, bot_key);
        let other_peer = PeerId::random();

        let handler = IdentifyStorePersistHandler;
        handler
            .handle(
                &state,
                &PeerEvent::IdentifyReceived {
                    peer: other_peer,
                    agent: "soma/test".into(),
                    protocols: 0,
                    public_key: None,
                },
            )
            .await;

        assert!(
            state
                .repos
                .peer_keys()
                .get(&other_peer.to_string())
                .await
                .expect("get")
                .is_none()
        );
    }

    /// Events this handler doesn't declare an interest in must be ignored
    /// even if mis-dispatched directly.
    #[tokio::test]
    async fn unrelated_event_is_ignored() {
        let (_dir, repos) = test_repos().await;
        let bot_key = Keypair::generate_ed25519();
        let bot_peer = bot_key.public().to_peer_id();
        let (state, _rx) = test_state(repos, bot_peer, bot_key);

        let handler = IdentifyStorePersistHandler;
        handler
            .handle(
                &state,
                &PeerEvent::ConnectionError {
                    peer: Some(PeerId::random()),
                    error: "boom".into(),
                },
            )
            .await;
        // No panic, and nothing to assert on storage — the interest
        // filter in `build_dispatcher` normally prevents this event from
        // ever reaching this handler; this just proves `handle` itself
        // degrades safely if it did.
    }
}
