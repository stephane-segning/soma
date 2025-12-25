use async_trait::async_trait;
use prost::Message;
use sha2::{Digest, Sha256};
use soma_core::SomaResult;

pub mod fs;

/// Protocol ID for fetching blobs over libp2p.
pub const BLOB_PROTOCOL: &str = "/soma/blob/1";

/// Conservative upper bound for a single blob request/response message (4-byte length + payload).
pub const MAX_BLOB_MESSAGE_BYTES: usize = 8 * 1024 * 1024;

/// Request to fetch a blob by CID.  The response includes bytes + metadata.
#[derive(Clone, PartialEq, Message)]
pub struct BlobRequest {
    #[prost(string, tag = "1")]
    pub cid: String,
    /// Optional logical scope (e.g. space id) for storage layout.
    #[prost(string, tag = "2")]
    pub space_id: String,
}

/// Response for a `BlobRequest`.
#[derive(Clone, PartialEq, Message)]
pub struct BlobResponse {
    #[prost(string, tag = "1")]
    pub cid: String,
    #[prost(string, tag = "2")]
    pub mime: String,
    #[prost(uint64, tag = "3")]
    pub size: u64,
    #[prost(bytes, tag = "4")]
    pub data: Vec<u8>,
    #[prost(bool, tag = "5")]
    pub found: bool,
    #[prost(string, tag = "6")]
    pub space_id: String,
}

/// Trait for storage backends that can service blob fetches and persist inbound bytes.
#[async_trait]
pub trait BlobProvider: Send + Sync {
    /// Fetch a blob by CID.  Returns `None` when the blob is missing locally.
    async fn get(&self, cid: &str, space_id: Option<&str>) -> Option<BlobResponse>;

    /// Persist a blob received from the network, verifying the CID before writing.
    async fn put(
        &self,
        expected_cid: &str,
        space_id: Option<&str>,
        bytes: &[u8],
        mime: &str,
    ) -> SomaResult<bool>;
}

/// Helper for computing the SHA-256 CID for a blob's bytes.
pub fn cid_for(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}
