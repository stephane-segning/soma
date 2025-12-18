use std::path::PathBuf;

use soma_core::SomaResult;
use soma_net::{default_identity_path, NetIdentity};
use tokio::signal;
use tracing::{info, warn};

/// Configuration for the relay service runtime.
#[derive(Debug, Clone)]
pub struct RelayConfig {
    /// Location where the libp2p identity key is persisted.
    pub identity_path: PathBuf,
}

impl Default for RelayConfig {
    fn default() -> Self {
        Self {
            identity_path: default_identity_path("relay"),
        }
    }
}

/// Entry point for the relay service logic.
///
/// A real circuit-relay swarm will be wired here next; for now we ensure identity
/// persistence and keep the task alive until shutdown is requested.
pub async fn run(config: RelayConfig) -> SomaResult<()> {
    let RelayConfig { identity_path } = config;
    let identity = NetIdentity::load_or_generate(&identity_path)?;
    info!(peer_id = %identity.peer_id(), ?identity_path, "relay service starting");

    signal::ctrl_c().await?;
    warn!("relay shutdown requested");
    Ok(())
}
