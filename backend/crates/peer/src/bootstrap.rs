use std::path::Path;

use libp2p::PeerId;
use soma_core::SomaResult;
use soma_net::NetIdentity;

use crate::{PeerConfig, PeerHandle, spawn_peer};

/// Builds a peer configuration using a libp2p identity.
pub trait PeerBootstrapper {
    fn identity_path(&self) -> &Path;
    fn build_config(&self, identity: &NetIdentity) -> PeerConfig;
}

/// Load or create identity, build config, and spawn the peer.
///
/// Returns the running peer handle plus the loaded identity (for callers that need the keypair).
pub fn spawn_with_identity<B: PeerBootstrapper>(
    bootstrapper: &B,
) -> SomaResult<(PeerHandle, NetIdentity)> {
    let identity = NetIdentity::load_or_generate(bootstrapper.identity_path())?;
    let config = bootstrapper.build_config(&identity);
    let peer = spawn_peer(config)?;
    Ok((peer, identity))
}

/// Helper to load or generate identity without spawning.
pub fn load_identity(path: &Path) -> SomaResult<NetIdentity> {
    NetIdentity::load_or_generate(path)
}

/// Helper to return the peer id for a given identity path (generated if missing).
pub fn ensure_peer_id(path: &Path) -> SomaResult<PeerId> {
    Ok(load_identity(path)?.peer_id())
}

