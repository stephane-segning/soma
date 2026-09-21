//! Bot-host handler for `PeerEvent::IssuerOfferReceived`.
//!
//! When the desktop owner issues a bot capability to this peer, the
//! codec layer auto-ACKs and emits this event. We verify it
//! (`soma_membership::verify_inbound_issuer_capability` — real signature
//! verification against a locally-pinned trust anchor, not just "the
//! sender says so") and persist the signed capability into
//! `issuer_capabilities` so the membership crate's join-decider can later
//! use it for auto-approval — without this, the owner sees `active` on
//! their side but the bot can't actually issue memberships against the
//! delegation.
//!
//! Once the delegation is on file, we also submit our own `JoinRequest`
//! back to the verified owner (`submit_self_join`) so the bot actually
//! becomes a `space_memberships` row -- ADR-0003 ("Bots are explicit
//! space members") and not merely a name in `issuer_capabilities`.
//! `SpaceAuthorizer::can_read_space` (`backend/crates/peer/src/runtime/blob/request.rs`)
//! gates every inbound blob request on exactly that membership row, so
//! without this step a mirror bot's own fetches get denied as "not a
//! member" forever. The owner-side auto-approval for this specific
//! request (no second manual click needed) lives in
//! `soma_membership::join_decider::storage`'s `self_issued_delegate_role`
//! — see its doc comment for why gating on the owner's own prior local
//! `issue_issuer_capability` call is safe and cannot be triggered by
//! anything a remote peer asserts about itself.
use std::time::SystemTime;

use async_trait::async_trait;
use libp2p::PeerId;
use libp2p::identity::PublicKey;
use prost::Message;
use prost_types::Timestamp;
use soma_membership::{PeerKeyResolver, bot_status, scopes::SCOPE_PENDING_REVIEW};
use soma_peer::PeerCommand;
use soma_peer::PeerEvent;
use soma_peer::events::{PeerEventHandler, PeerEventKind};
use soma_proto_build::space::{self, SpaceRole};
use soma_storage::issuer::{IssuerCapability as StoredIssuerCapability, IssuerRepository};
use soma_storage::membership::{JoinRequest as StoredJoinRequest, MembershipRepository};
use soma_storage::peers::PeerPublicKeyRepository;
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

        let resolver = BotPeerKeyResolver(ctx);
        let (anchor, owner_pub) = match soma_membership::verify_inbound_issuer_capability(
            &ctx.repos.membership(),
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

        // Cache the now-verified owner key durably. `somad bot` does not
        // (unlike the desktop daemon) run any handler that persists
        // Identify-observed keys on its own, so this write is often the
        // ONLY way the bot ever learns this peer's key -- see the fix
        // report's residual-risk notes on this.
        let issued_at = now_secs();
        let _ = ctx
            .repos
            .peer_keys()
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

        let row = StoredIssuerCapability {
            space_id,
            // Verified above, rather than trusted from the payload: the
            // owner identity is `anchor`, which
            // `verify_inbound_issuer_capability` has already confirmed
            // matches both the offer's own claim and (if one was already
            // pinned) this space's locally-pinned owner.
            issuer_peer_id: anchor.peer_id().to_string(),
            delegate_peer_id: ctx.peer_id.to_string(),
            issued_at,
            expires_at: capability.expires_at.as_ref().map(|ts| ts.seconds),
            capability: Some(capability.encode_to_vec()),
            alias: None,
            // Verified above via a real signature check against the
            // space's trust-anchored owner
            // (`soma_common::verify_issuer_capability`), so it's safe to
            // activate immediately.
            status: bot_status::ACTIVE.to_string(),
            // Fail closed (membership-forgery fix, item 6): a capability
            // that just arrived over the wire has had NO local operator
            // review, so it must NOT inherit the "empty means
            // unrestricted" meaning reserved for genuinely pre-#92,
            // LOCALLY owner-authored rows (see `soma_membership::scopes`).
            // Previously this wrote `Vec::new()`, which -- because empty
            // means unrestricted -- was itself a privilege-escalation
            // default: any inbound offer silently got unrestricted
            // `issue:membership` the moment its (now-verified) signature
            // checked out.
            scopes: vec![SCOPE_PENDING_REVIEW.to_string()],
        };

        match ctx.repos.issuer().upsert(&row).await {
            Ok(()) => submit_self_join(ctx, &anchor.peer_id(), &row.space_id).await,
            Err(err) => warn!(?err, %from, "failed to persist inbound issuer capability"),
        }
    }
}

/// Submit our own `JoinRequest` to `owner` so the delegation just
/// verified above completes into a real `space_memberships` row (see the
/// module doc comment). No-op if we're already a member of `space_id`
/// (idempotent against a re-sent or duplicate offer).
async fn submit_self_join(ctx: &BotState, owner: &PeerId, space_id: &str) {
    let already_member = ctx
        .repos
        .membership()
        .get_membership(space_id, &ctx.peer_id.to_string())
        .await
        .ok()
        .flatten()
        .is_some();
    if already_member {
        return;
    }

    let request_id = format!("{:016x}", rand::random::<u64>());
    let join_request = space::JoinRequest {
        space_id: Some(space::SpaceId {
            value: space_id.to_string(),
        }),
        peer_id: Some(space::PeerId {
            value: ctx.peer_id.to_string(),
        }),
        display_name: "bot".into(),
        device_name: String::new(),
        requester_code: String::new(),
        requested_role: SpaceRole::Bot as i32,
        invite_proof: None,
        created_at: Some(Timestamp::from(SystemTime::now())),
    };

    // Durably record that THIS peer itself asked `owner` about
    // `space_id` -- the same correlation ground truth
    // `verify_and_apply_inbound_join_decision` requires before it will
    // accept the inbound `JoinDecision` this request should provoke (see
    // `DaemonHandle::join_space`'s identically-purposed
    // `record_outgoing_join_request`). Without this row, the owner's
    // approval would arrive back here and be rejected as an unsolicited
    // decision -- the exact attack the correlation gate defends against.
    if let Err(err) = ctx
        .repos
        .membership()
        .upsert_join_request(&StoredJoinRequest {
            request_id: request_id.clone(),
            space_id: space_id.to_string(),
            subject_peer_id: ctx.peer_id.to_string(),
            display_name: String::new(),
            device_name: String::new(),
            requested_role: SpaceRole::Bot as i32,
            created_at: now_secs(),
            payload: None,
            target_peer_id: Some(owner.to_string()),
            status: "pending".into(),
            attempts: 0,
            next_attempt_at: 0,
            last_error: None,
            is_outgoing: true,
        })
        .await
    {
        warn!(%err, %owner, %space_id, "failed to persist outgoing self-join request");
        return;
    }

    // The offer we just verified arrived over an active connection to
    // `owner` (the codec auto-ACKed it), so no addresses are needed to
    // reach it -- same pattern as `SendJoinDecision`'s dispatch elsewhere
    // in this codebase (`addrs: Vec::new()`) for replying to a peer
    // we're already talking to. Unrelated to item 3's addressing bug,
    // which is about a COLD first contact with no connection at all.
    if let Err(err) = ctx
        .peer_commands
        .send(PeerCommand::SendJoinRequest {
            target: *owner,
            addrs: Vec::new(),
            delivery_id: request_id.clone(),
            request_id,
            request: join_request,
        })
        .await
    {
        warn!(?err, %owner, %space_id, "failed to submit self-join request (peer task unreachable)");
    }
}

/// Resolves a peer's authenticated public key from the bot's persisted
/// `peer_public_keys` table.
///
/// Bootstrapping for a brand-new owner's FIRST-EVER offer: `event_handlers::identify_store::IdentifyStorePersistHandler`
/// is registered in `event_handlers.rs`'s `build_handlers()` for
/// `PeerEventKind::IdentifyReceived`, which fires as connections are
/// established -- well before any application-level offer is sent. By
/// the time this resolver runs, the sender's key is normally already on
/// file, so `verify_inbound_issuer_capability` can succeed on the very
/// first offer instead of only for an owner whose key this bot happened
/// to have on file some other way.
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

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::bot::event_handlers::identify_store::IdentifyStorePersistHandler;
    use crate::commands::bot::event_handlers::test_support::{test_repos, test_state};
    use libp2p::identity::Keypair;

    fn signed_offer(owner: &Keypair, bot_peer: &PeerId, space_id: &str) -> space::IssuerCapability {
        let mut cap = space::IssuerCapability {
            space_id: Some(space::SpaceId {
                value: space_id.to_string(),
            }),
            issuer_peer_id: Some(space::PeerId {
                value: bot_peer.to_string(),
            }),
            allowed_roles: vec![SpaceRole::Member as i32],
            default_permissions: Vec::new(),
            issued_at: None,
            expires_at: None,
            max_member_expires_at: None,
            max_issues_per_hour: 0,
            owner_peer_id: Some(space::PeerId {
                value: owner.public().to_peer_id().to_string(),
            }),
            signed: None,
        };
        soma_common::sign_issuer_capability(&mut cap, owner).expect("sign issuer capability");
        cap
    }

    /// Negative control matching the pre-fix behaviour: a peer this bot
    /// has never Identify'd has no key on file, so verification correctly
    /// fails closed and nothing is persisted or self-joined.
    #[tokio::test]
    async fn first_ever_offer_is_rejected_without_a_prior_identify() {
        let (_dir, repos) = test_repos().await;
        let bot_key = Keypair::generate_ed25519();
        let bot_peer = bot_key.public().to_peer_id();
        let (state, mut rx) = test_state(repos, bot_peer, bot_key);

        let owner = Keypair::generate_ed25519();
        let owner_peer = owner.public().to_peer_id();
        let cap = signed_offer(&owner, &bot_peer, "space-1");

        IssuerInboundHandler
            .handle(
                &state,
                &PeerEvent::IssuerOfferReceived {
                    from: owner_peer,
                    space_id: "space-1".into(),
                    capability: cap,
                },
            )
            .await;

        assert!(
            state
                .repos
                .issuer()
                .get("space-1", &bot_peer.to_string())
                .await
                .expect("get")
                .is_none(),
            "an offer from a peer we've never Identify'd has no key to verify against"
        );
        assert!(
            rx.try_recv().is_err(),
            "must not attempt to self-join when verification failed"
        );
    }

    /// The fix (item 1 + item 2 together): once
    /// `IdentifyStorePersistHandler` has observed the owner's key -- as it
    /// would from a real libp2p Identify exchange at connection time,
    /// well before any application-level offer -- the bot's FIRST-EVER
    /// offer from that owner verifies, AND the bot immediately attempts
    /// to become a real space member instead of stopping at merely
    /// holding a delegation.
    #[tokio::test]
    async fn first_ever_offer_verifies_and_bot_self_joins_once_identify_has_been_observed() {
        let (_dir, repos) = test_repos().await;
        let bot_key = Keypair::generate_ed25519();
        let bot_peer = bot_key.public().to_peer_id();
        let (state, mut rx) = test_state(repos, bot_peer, bot_key);

        let owner = Keypair::generate_ed25519();
        let owner_peer = owner.public().to_peer_id();

        // Simulate the libp2p Identify exchange that happens as
        // connections are established, before any application-level
        // message.
        IdentifyStorePersistHandler
            .handle(
                &state,
                &PeerEvent::IdentifyReceived {
                    peer: owner_peer,
                    agent: "soma/test".into(),
                    protocols: 3,
                    public_key: Some(owner.public()),
                },
            )
            .await;

        let cap = signed_offer(&owner, &bot_peer, "space-1");
        IssuerInboundHandler
            .handle(
                &state,
                &PeerEvent::IssuerOfferReceived {
                    from: owner_peer,
                    space_id: "space-1".into(),
                    capability: cap,
                },
            )
            .await;

        let stored = state
            .repos
            .issuer()
            .get("space-1", &bot_peer.to_string())
            .await
            .expect("get")
            .expect("verified offer must be persisted");
        assert_eq!(stored.status, bot_status::ACTIVE);
        assert_eq!(stored.issuer_peer_id, owner_peer.to_string());

        // Item 2: the bot must attempt to become a real member, not just
        // record the delegation.
        let sent = rx
            .try_recv()
            .expect("bot must submit a self-join request after verifying the delegation");
        match sent {
            PeerCommand::SendJoinRequest {
                target, request, ..
            } => {
                assert_eq!(target, owner_peer);
                assert_eq!(request.requested_role, SpaceRole::Bot as i32);
                assert_eq!(
                    request.space_id.as_ref().map(|s| s.value.as_str()),
                    Some("space-1")
                );
                assert_eq!(
                    request.peer_id.as_ref().map(|p| p.value.as_str()),
                    Some(bot_peer.to_string()).as_deref()
                );
            }
            other => panic!("expected SendJoinRequest, got {other:?}"),
        }

        let outgoing = state
            .repos
            .membership()
            .find_outgoing_join_request("space-1", &owner_peer.to_string())
            .await
            .expect("find_outgoing_join_request")
            .expect("must have recorded a correlating outgoing join request");
        assert_eq!(outgoing.subject_peer_id, bot_peer.to_string());
        assert!(outgoing.is_outgoing);
    }

    /// Idempotency: a bot that's already a member (e.g. a re-sent or
    /// duplicate offer after the join already completed) must not spam
    /// another join request.
    #[tokio::test]
    async fn does_not_resubmit_a_join_request_once_already_a_member() {
        let (_dir, repos) = test_repos().await;
        let bot_key = Keypair::generate_ed25519();
        let bot_peer = bot_key.public().to_peer_id();
        let (state, mut rx) = test_state(repos, bot_peer, bot_key);
        let owner_peer = Keypair::generate_ed25519().public().to_peer_id();

        state
            .repos
            .membership()
            .upsert_membership(&soma_storage::membership::SpaceMembership {
                space_id: "space-1".into(),
                subject_peer_id: bot_peer.to_string(),
                role: "bot".into(),
                issuer_peer_id: owner_peer.to_string(),
                issued_at: 0,
                expires_at: None,
                capability: None,
            })
            .await
            .expect("seed membership");

        submit_self_join(&state, &owner_peer, "space-1").await;

        assert!(
            rx.try_recv().is_err(),
            "already a member: must not send a duplicate self-join request"
        );
    }
}
