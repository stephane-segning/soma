//! In-process handle to a running daemon.
//!
//! Methods validate their inputs, call into `crate::services::*`, and map the
//! results to plain Rust records in [`types`] — no proto, no tonic — so the
//! napi-rs addon and other Rust embedders can call into the daemon without a
//! transport hop.

use std::sync::Arc;

use soma_core::{Error, SomaResult};

use crate::state::DaemonState;

pub mod types;

pub mod blobs;
mod discover;
mod documents;
mod events;
mod issuer;
mod joins;
mod members;
mod pages;
mod revoke;
mod spaces;
mod status;

/// Build a validation error for use inside handle methods. Maps to
/// `soma_core::Error::Service` so embedders see a structured error instead of
/// a panic.
pub(crate) fn invalid(msg: impl Into<String>) -> Error {
    Error::service(msg.into())
}

/// Parse caller-supplied multiaddr strings, rejecting the whole batch on
/// the first invalid entry. Shared by every handle method that dispatches
/// a `PeerCommand` needing dial addresses (`join_space`,
/// `issue_issuer_capability`) so a freshly-deployed target with no prior
/// connection and no rendezvous config can still be reached on the first
/// try — see `IssueIssuerCapabilityInput::target_multiaddrs`'s doc comment
/// for the failure mode this closes.
pub(crate) fn parse_multiaddrs(addrs: Vec<String>) -> SomaResult<Vec<libp2p::Multiaddr>> {
    addrs
        .into_iter()
        .map(|addr| addr.parse().map_err(|_| invalid("invalid multiaddr")))
        .collect()
}

/// Opaque accessor for in-process callers to invoke daemon operations
/// without going through the gRPC trampoline. Cloneable — handles share
/// the same underlying [`DaemonState`].
#[derive(Clone)]
pub struct DaemonHandle {
    pub(crate) state: Arc<DaemonState>,
}

impl DaemonHandle {
    /// Construct a handle from a shared [`DaemonState`]. Public to the crate
    /// only; embedders get one via [`crate::RuntimeHandle::handle`].
    pub(crate) fn new(state: Arc<DaemonState>) -> Self {
        Self { state }
    }
}

/// Snapshot of daemon health for in-process callers (the napi addon, tests).
#[derive(Debug, Clone)]
pub struct DaemonStatus {
    pub peer_id: String,
    pub listen_addrs: Vec<String>,
}

/// Ensure the daemon peer has a membership row for `space_id`. Returns a
/// `Service` error if not, mirroring the `PermissionDenied` gRPC semantics.
pub(crate) async fn ensure_membership(state: &DaemonState, space_id: &str) -> SomaResult<()> {
    let peer_id = state.peer_id.to_string();
    let repo = state.repos.membership_repo();
    match repo.get_membership(space_id, &peer_id).await? {
        Some(_) => Ok(()),
        None => Err(invalid("not a member of this space")),
    }
}

/// Wall-clock millis since the Unix epoch, clamped to `i64::MAX`. Shared by
/// every handle that needs `created_at_ms` / `updated_at_ms` defaults.
pub(crate) fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_input_parses_to_empty_addrs() {
        assert_eq!(
            parse_multiaddrs(Vec::new()).expect("empty is valid"),
            Vec::new()
        );
    }

    #[test]
    fn valid_multiaddrs_parse() {
        let addrs = parse_multiaddrs(vec![
            "/ip4/127.0.0.1/tcp/14005".to_string(),
            "/ip4/127.0.0.1/udp/14205/quic-v1".to_string(),
        ])
        .expect("both addrs are valid multiaddrs");
        assert_eq!(addrs.len(), 2);
    }

    #[test]
    fn one_invalid_multiaddr_rejects_the_whole_batch() {
        let err = parse_multiaddrs(vec![
            "/ip4/127.0.0.1/tcp/14005".to_string(),
            "not-a-multiaddr".to_string(),
        ])
        .expect_err("a malformed entry must reject the whole call, not be silently dropped");
        assert!(err.to_string().contains("invalid multiaddr"));
    }
}
