//! What [`DocumentSyncHandler`](crate::DocumentSyncHandler) needs from
//! whatever process is running it.
//!
//! `soma-daemon` and `somad bot` each have their own state type
//! (`DaemonState`, `BotState`) with their own fields, event buses and
//! construction — there is no shared base type to hang this off, and
//! there should not be: a bot has no renderer, no listen-address cache,
//! none of the rest of `DaemonState`. This trait is the minimal seam
//! between the two: the three things replication actually touches.

use std::sync::Arc;

use libp2p::PeerId;
use soma_peer::PeerCommand;
use soma_storage::RepositoryProvider;
use tokio::sync::mpsc;

/// Accessors a replication trigger handler needs, independent of which
/// binary is hosting it.
pub trait SyncContext: Send + Sync {
    /// Storage.
    ///
    /// Returned owned rather than borrowed: `DaemonState` already holds
    /// an `Arc<dyn RepositoryProvider>`, but `BotState` holds the
    /// concrete `soma_storage::RepositoryFactory` (it has no reason to
    /// box it, since nothing else in `somad` needs the trait object).
    /// An owned `Arc` lets both implementations return the same type —
    /// for `DaemonState` that's a refcount bump; for `BotState` it's a
    /// cheap wrap of an already-cheap-to-clone factory.
    fn repos(&self) -> Arc<dyn RepositoryProvider>;

    /// This node's own peer id.
    fn local_peer_id(&self) -> PeerId;

    /// Channel to the running peer swarm task.
    fn peer_commands(&self) -> &mpsc::Sender<PeerCommand>;
}
