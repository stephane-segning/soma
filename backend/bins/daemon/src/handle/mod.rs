//! In-process handle to a running daemon.
//!
//! This is the parallel surface to [`crate::grpc`]: same underlying services,
//! but plain Rust types (no proto, no tonic) so the napi-rs addon and other
//! Rust embedders can call into the daemon without going through a transport.
//!
//! Methods validate their inputs, call into `crate::services::*`, and map the
//! results to the records in [`types`]. The existing gRPC service stays as the
//! binary's Unix-socket interface and is not affected.

use std::sync::Arc;

use soma_core::{Error, SomaResult};

use crate::grpc::DaemonState;

pub mod types;

mod blobs;
mod discover;
mod documents;
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
pub(crate) async fn ensure_membership(
    state: &DaemonState,
    space_id: &str,
) -> SomaResult<()> {
    let peer_id = state.peer_id.to_string();
    let repo = state.repos.membership_repo();
    match repo.get_membership(space_id, &peer_id).await? {
        Some(_) => Ok(()),
        None => Err(invalid("not a member of this space")),
    }
}
