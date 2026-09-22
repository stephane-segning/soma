//! Replication policy the peer runtime delegates to.
//!
//! The `soma-peer` crate deliberately owns no storage and no membership
//! table, so anything it needs to *decide* — may this peer read this
//! space, which version of a document wins — is implemented here and
//! injected as a trait object, the same way `BlobProvider` and
//! `JoinDecider` already are.
//!
//! This crate started life inside `soma-daemon` (see `sync.rs` there,
//! now a thin re-export) and moved out so `somad bot` — which has no
//! dependency on `soma-daemon` and never will, since a bot has no
//! renderer, no desktop shell, none of what that crate exists to serve
//! — can link the same replication policy instead of forking it. A bot
//! provides always-on availability for a space precisely by running
//! this: mirroring documents and rosters even while every other member
//! is offline.

mod context;
mod documents;
mod handler;
mod roster;

pub use context::SyncContext;
pub use documents::StorageDocumentSync;
pub use handler::DocumentSyncHandler;
pub use roster::StorageRosterSync;

use libp2p::PeerId;
use soma_storage::RepositoryProvider;

/// Every peer we believe is in `space_id`, excluding ourselves.
///
/// This is the membership roster *plus the pinned owner*, and the owner
/// is not a nicety — without it replication does not work in one
/// direction at all. A peer that joins by invite records a membership
/// row only for itself, so its roster is `[me]`: it has nobody to send
/// to, and it rejects the owner when the owner sends to it. Both halves
/// of that showed up only when two real daemons were run against each
/// other.
///
/// `owner_peer_id` is the trust anchor pinned at join time, so this
/// leans on a value the membership machinery already treats as
/// authoritative rather than inventing a new one.
///
/// Known gap: two non-owner members still cannot see each other, so
/// today everything flows via the owner or a bot mirror. Closing it
/// means replicating each membership row together with its owner-signed
/// capability so a peer can *verify* a third party's membership instead
/// of being told about it.
pub async fn space_peers(
    repos: &dyn RepositoryProvider,
    space_id: &str,
    me: &PeerId,
) -> Vec<PeerId> {
    let repo = repos.membership_repo();
    let me_str = me.to_string();
    let mut out: Vec<PeerId> = Vec::new();

    if let Ok(members) = repo.list_memberships(space_id).await {
        for m in members {
            if m.subject_peer_id == me_str {
                continue;
            }
            if let Ok(peer) = m.subject_peer_id.parse() {
                out.push(peer);
            }
        }
    }

    if let Ok(Some(space)) = repo.get_space(space_id).await
        && let Some(owner) = space.owner_peer_id
        && owner != me_str
        && let Ok(peer) = owner.parse()
        && !out.contains(&peer)
    {
        out.push(peer);
    }

    out
}
