use std::error::Error;

/// Entry point for the relay service logic (libp2p, etc.).
/// HTTP concerns (health/metrics) are handled in the binary.
pub async fn run() -> Result<(), Box<dyn Error + Send + Sync>> {
    // TODO: implement relay/libp2p logic.
    Ok(())
}
