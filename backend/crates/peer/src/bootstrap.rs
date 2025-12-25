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

/// Launcher that owns a bootstrapper and produces peer handles.
pub struct PeerLauncher<'a, B: PeerBootstrapper> {
    bootstrapper: &'a B,
}

impl<'a, B: PeerBootstrapper> PeerLauncher<'a, B> {
    pub fn new(bootstrapper: &'a B) -> Self {
        Self { bootstrapper }
    }

    /// Load or create identity, build config, and spawn the peer.
    ///
    /// Returns the running peer handle plus the loaded identity (for callers that need the keypair).
    pub fn spawn(self) -> SomaResult<(PeerHandle, NetIdentity)> {
        let identity = NetIdentity::load_or_generate(self.bootstrapper.identity_path())?;
        let config = self.bootstrapper.build_config(&identity);
        let peer = spawn_peer(config)?;
        Ok((peer, identity))
    }

    /// Load or generate the identity only.
    pub fn load_identity(&self) -> SomaResult<NetIdentity> {
        NetIdentity::load_or_generate(self.bootstrapper.identity_path())
    }

    /// Return the peer id for the bootstrapper's identity path (generated if missing).
    pub fn ensure_peer_id(&self) -> SomaResult<PeerId> {
        Ok(self.load_identity()?.peer_id())
    }
}

/// Helper to load or generate identity without spawning.
pub fn load_identity(path: &Path) -> SomaResult<NetIdentity> {
    NetIdentity::load_or_generate(path)
}

/// Helper to return the peer id for a given identity path (generated if missing).
pub fn ensure_peer_id(path: &Path) -> SomaResult<PeerId> {
    Ok(load_identity(path)?.peer_id())
}
