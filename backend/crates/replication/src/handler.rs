//! Starts a `/soma/doc-sync/1` exchange when there is a reason to, and
//! asks for the space roster at the same moments.
//!
//! Generic over [`SyncContext`] so both `soma-daemon` (`DaemonState`)
//! and `somad bot` (`BotState`) drive the exact same trigger logic
//! instead of maintaining two copies that quietly drift apart — this
//! handler used to live only in `soma-daemon`, typed directly to
//! `DaemonState`.
//!
//! Three triggers, and all three are needed:
//!
//! - **A peer connected.** Announcing on write alone only reaches peers
//!   that happen to be online at that moment, so anything written while
//!   a member was offline would never reach them.
//! - **We just joined a space.** A join usually happens over a
//!   connection that is *already* established, so no new
//!   `ConnectionEstablished` follows it. Without this trigger a peer
//!   that joins an existing space receives everything written from then
//!   on and nothing written before — which is exactly what a two-daemon
//!   run showed.
//!
//! - **We learned new members.** Roster replication is what makes a
//!   peer authorizable in the first place, so a sync attempted before
//!   it would have been refused. Reacting to `RosterLearned` retries
//!   immediately instead of waiting for the next reconnect — without
//!   it two members converge only when mDNS happens to re-dial them.
//!
//! Re-offering is cheap: the digest comparison makes a redundant
//! exchange cost one round trip and no writes. That is also why
//! replication needs no mailbox — a join decision is a one-off event
//! that is lost if missed, but a document is durable state, so
//! re-deriving what is missing on reconnect is both cheaper and more
//! robust than queueing every intermediate version.

use std::marker::PhantomData;

use async_trait::async_trait;
use libp2p::PeerId;
use soma_peer::events::{PeerEventHandler, PeerEventKind};
use soma_peer::{DocumentSyncRequest, PeerCommand, PeerEvent};
use tracing::{debug, warn};

use crate::SyncContext;

/// `PhantomData<fn() -> Ctx>` rather than `PhantomData<Ctx>` so this
/// stays `Send + Sync` regardless of `Ctx`'s own variance — it never
/// actually stores a `Ctx`.
pub struct DocumentSyncHandler<Ctx>(PhantomData<fn() -> Ctx>);

impl<Ctx> Default for DocumentSyncHandler<Ctx> {
    fn default() -> Self {
        Self(PhantomData)
    }
}

impl<Ctx> DocumentSyncHandler<Ctx> {
    pub fn new() -> Self {
        Self::default()
    }
}

#[async_trait]
impl<Ctx: SyncContext + 'static> PeerEventHandler<Ctx> for DocumentSyncHandler<Ctx> {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[
            PeerEventKind::ConnectionEstablished,
            PeerEventKind::JoinDecision,
            PeerEventKind::RosterLearned,
        ]
    }

    async fn handle(&self, ctx: &Ctx, event: &PeerEvent) {
        match event {
            PeerEvent::ConnectionEstablished { peer } => {
                for space_id in spaces_shared_with(ctx, peer).await {
                    // Roster first: it is what lets us authorize the
                    // other members, and it is cheap when unchanged.
                    request_roster(ctx, peer, &space_id).await;
                    offer(ctx, peer, &space_id).await;
                }
            }
            // Newly authorizable peers — sync with them now rather than
            // waiting for mDNS to re-dial.
            PeerEvent::RosterLearned { space_id, peers } => {
                for peer in peers {
                    debug!(%peer, %space_id, "doc-sync: syncing a newly-learned member");
                    offer(ctx, peer, space_id).await;
                }
            }
            // The decision may be a rejection, or for a space we are
            // already in; `spaces_shared_with` re-reads storage, so a
            // decision that changed nothing simply yields nothing.
            PeerEvent::JoinDecision { from, decision } => {
                if *from == ctx.local_peer_id() {
                    return;
                }
                let Some(space_id) = decision.space_id.as_ref().map(|s| s.value.clone()) else {
                    return;
                };
                // Deliberately NOT gated on `spaces_shared_with`. This
                // handler and `JoinDecisionPersistenceHandler` both react
                // to `JoinDecision` from independent queues, so the
                // membership row may not be written yet — gating on it
                // made the post-join sync a coin flip, and a lost toss
                // meant waiting for the next mDNS re-dial. Asking the
                // peer that just approved us needs no local state: it
                // authorizes the request itself, and refuses if we are
                // wrong.
                debug!(peer = %from, %space_id, "doc-sync: syncing after join");
                request_roster(ctx, from, &space_id).await;
                offer(ctx, from, &space_id).await;
            }
            _ => {}
        }
    }
}

/// Ask `peer` who else is in `space_id`.
///
/// Fire-and-forget. A refusal (the peer does not know us yet) is
/// normal on a first encounter and resolves once that peer learns the
/// roster from someone who does.
async fn request_roster<Ctx: SyncContext>(ctx: &Ctx, peer: &PeerId, space_id: &str) {
    let _ = ctx
        .peer_commands()
        .send(PeerCommand::RequestRoster {
            target: *peer,
            space_id: space_id.to_string(),
        })
        .await;
}

/// Send `peer` our digests for `space_id`.
///
/// An empty digest list is still worth sending: it is how a peer that
/// holds nothing asks for everything.
async fn offer<Ctx: SyncContext>(ctx: &Ctx, peer: &PeerId, space_id: &str) {
    let have = match ctx
        .repos()
        .document_repo()
        .list_document_digests(space_id)
        .await
    {
        Ok(rows) => rows
            .into_iter()
            .map(|d| soma_peer::DocumentDigest {
                document_id: d.document_id,
                updated_at_ms: d.updated_at_ms,
                origin_peer_id: d.origin_peer_id,
                published: d.published,
            })
            .collect(),
        Err(err) => {
            warn!(%space_id, %err, "doc-sync: failed to list digests");
            return;
        }
    };

    debug!(%peer, %space_id, "doc-sync: offering");
    let _ = ctx
        .peer_commands()
        .send(PeerCommand::SyncDocuments {
            target: *peer,
            request: DocumentSyncRequest {
                space_id: space_id.to_string(),
                have,
                want: Vec::new(),
                documents: Vec::new(),
            },
        })
        .await;
}

/// Spaces we are in that we also believe `peer` is in.
///
/// Offering a space the peer is not in would tell it that space exists
/// and what is in it — the responder would refuse, but the digests
/// would already have left this process.
async fn spaces_shared_with<Ctx: SyncContext>(ctx: &Ctx, peer: &PeerId) -> Vec<String> {
    let local_peer_id = ctx.local_peer_id();
    let repos = ctx.repos();
    let mine = match repos
        .membership_repo()
        .list_memberships_by_subject(&local_peer_id.to_string())
        .await
    {
        Ok(mine) => mine,
        Err(err) => {
            warn!(%peer, %err, "doc-sync: failed to list own memberships");
            return Vec::new();
        }
    };

    let mut shared = Vec::new();
    for m in mine {
        if crate::space_peers(repos.as_ref(), &m.space_id, &local_peer_id)
            .await
            .contains(peer)
        {
            shared.push(m.space_id);
        }
    }
    shared
}
