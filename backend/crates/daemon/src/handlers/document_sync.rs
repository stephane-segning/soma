//! Starts a `/soma/doc-sync/1` exchange when there is a reason to.
//!
//! Two triggers, and both are needed:
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
//! Re-offering is cheap: the digest comparison makes a redundant
//! exchange cost one round trip and no writes. That is also why
//! replication needs no mailbox — a join decision is a one-off event
//! that is lost if missed, but a document is durable state, so
//! re-deriving what is missing on reconnect is both cheaper and more
//! robust than queueing every intermediate version.

use async_trait::async_trait;
use libp2p::PeerId;
use soma_peer::events::{PeerEventHandler, PeerEventKind};
use soma_peer::{DocumentSyncRequest, PeerCommand, PeerEvent};
use tracing::{debug, warn};

use crate::state::DaemonState;

pub struct DocumentSyncHandler;

#[async_trait]
impl PeerEventHandler<DaemonState> for DocumentSyncHandler {
    fn interests(&self) -> &'static [PeerEventKind] {
        &[PeerEventKind::ConnectionEstablished, PeerEventKind::JoinDecision]
    }

    async fn handle(&self, ctx: &DaemonState, event: &PeerEvent) {
        match event {
            PeerEvent::ConnectionEstablished { peer } => {
                for space_id in spaces_shared_with(ctx, peer).await {
                    offer(ctx, peer, &space_id).await;
                }
            }
            // The decision may be a rejection, or for a space we are
            // already in; `spaces_shared_with` re-reads storage, so a
            // decision that changed nothing simply yields nothing.
            PeerEvent::JoinDecision { from, decision } => {
                if *from == ctx.peer_id {
                    return;
                }
                let Some(space_id) = decision.space_id.as_ref().map(|s| s.value.clone()) else {
                    return;
                };
                if spaces_shared_with(ctx, from).await.contains(&space_id) {
                    debug!(peer = %from, %space_id, "doc-sync: syncing after join");
                    offer(ctx, from, &space_id).await;
                }
            }
            _ => {}
        }
    }
}

/// Send `peer` our digests for `space_id`.
///
/// An empty digest list is still worth sending: it is how a peer that
/// holds nothing asks for everything.
async fn offer(ctx: &DaemonState, peer: &PeerId, space_id: &str) {
    let have = match ctx
        .repos
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
        .peer_commands
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
async fn spaces_shared_with(ctx: &DaemonState, peer: &PeerId) -> Vec<String> {
    let mine = match ctx
        .repos
        .membership_repo()
        .list_memberships_by_subject(&ctx.peer_id.to_string())
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
        if crate::sync::space_peers(ctx.repos.as_ref(), &m.space_id, &ctx.peer_id)
            .await
            .contains(peer)
        {
            shared.push(m.space_id);
        }
    }
    shared
}
