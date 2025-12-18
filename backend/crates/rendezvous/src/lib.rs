use std::path::PathBuf;

use soma_core::SomaResult;
use soma_net::{default_identity_path, NetIdentity};
use tokio::signal;
use tracing::{info, warn};

/// Configuration for the rendezvous service runtime.
#[derive(Debug, Clone)]
pub struct RendezvousConfig {
    /// Location where the libp2p identity key is persisted.
    pub identity_path: PathBuf,
}

impl Default for RendezvousConfig {
    fn default() -> Self {
        Self {
            identity_path: default_identity_path("rendezvous"),
        }
    }
}

/// Entry point for the rendezvous service logic.
///
/// A full rendezvous server will be wired here; for now we ensure persistent identity
/// and keep the task alive until shutdown.
pub async fn run(config: RendezvousConfig) -> SomaResult<()> {
    let RendezvousConfig { identity_path } = config;
    let identity = NetIdentity::load_or_generate(&identity_path)?;
    info!(peer_id = %identity.peer_id(), ?identity_path, "rendezvous service starting");

    signal::ctrl_c().await.map_err(soma_core::Error::service)?;
    warn!("rendezvous shutdown requested");
    Ok(())
}
