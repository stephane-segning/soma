//! Peer-to-peer blob resolution: given a CID this device doesn't have
//! locally, find a peer that does and fetch verified bytes from it.
//!
//! This module is the missing network half described in AGENTS.md's
//! "Blobs" and "Bots and always-on availability" sections. It does not
//! duplicate the already-correct, already-verified local store
//! (`soma_vdfs::fs::FsBlobStore`) or the already-wired inbound/outbound
//! wire handling (`crate::runtime::blob`) — it sits on top of both,
//! driving [`crate::PeerCommand::FetchBlob`] from outside the swarm task.

mod bridge;
mod directory;
mod resolver;

#[cfg(test)]
mod tests;

pub use bridge::BlobResolverBridge;
pub use directory::{CandidatePeerSource, PeerDirectory};
pub use resolver::{BlobResolveError, BlobResolver, BlobResolverConfig, PeerBlobResolver};
