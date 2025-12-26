use async_trait::async_trait;
use prost::Message;
use sha2::{Digest, Sha256};
use soma_core::SomaResult;

pub mod fs;

/// Protocol ID for fetching blobs over libp2p.
pub const BLOB_PROTOCOL: &str = "/soma/blob/1";

/// Conservative upper bound for a single blob request/response message (4-byte length + payload).
pub const MAX_BLOB_MESSAGE_BYTES: usize = 8 * 1024 * 1024;
/// Default chunk size used when streaming large blobs.
pub const DEFAULT_BLOB_CHUNK_BYTES: usize = 2 * 1024 * 1024;

/// Range request for partial blob reads.
#[derive(Clone, Copy, Debug)]
pub struct BlobRange {
    pub offset: u64,
    pub length: Option<usize>,
}

impl BlobRange {
    pub const fn full() -> Self {
        Self {
            offset: 0,
            length: None,
        }
    }

    pub const fn with_len(offset: u64, length: usize) -> Self {
        Self {
            offset,
            length: Some(length),
        }
    }
}

/// Streaming writer handle for large blob ingestion.
#[async_trait]
pub trait BlobWriteStream: Send {
    /// Append a chunk at the expected offset. Implementations should reject out-of-order offsets.
    async fn write_chunk(&mut self, offset: u64, bytes: &[u8]) -> SomaResult<()>;

    /// Finalize the blob (e.g., verify CID and atomically rename into place). Returns true on success.
    async fn finish(self: Box<Self>) -> SomaResult<bool>;

    /// Abort the write and clean up any temp artifacts.
    async fn abort(self: Box<Self>);
}

/// Outcome of starting a streaming write.
pub enum BlobWriteInit {
    Started(Box<dyn BlobWriteStream>),
    AlreadyPresent,
}

/// Request to fetch a blob by CID.  The response includes bytes + metadata.
#[derive(Clone, PartialEq, Message)]
pub struct BlobRequest {
    #[prost(string, tag = "1")]
    pub cid: String,
    /// Optional logical scope (e.g. space id) for storage layout.
    #[prost(string, tag = "2")]
    pub space_id: String,
    /// Byte offset to start reading from (for chunked transfers).
    #[prost(uint64, tag = "3")]
    pub offset: u64,
    /// Maximum bytes to return from the offset. 0 means provider-chosen default.
    #[prost(uint32, tag = "4")]
    pub length: u32,
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
    /// Offset of this chunk within the blob.
    #[prost(uint64, tag = "7")]
    pub offset: u64,
    /// True when this chunk includes the final bytes of the blob.
    #[prost(bool, tag = "8")]
    pub eof: bool,
}

/// Trait for storage backends that can service blob fetches and persist inbound bytes.
#[async_trait]
pub trait BlobProvider: Send + Sync {
    /// Fetch a blob by CID.  Returns `None` when the blob is missing locally.
    async fn get(
        &self,
        cid: &str,
        space_id: Option<&str>,
        range: BlobRange,
    ) -> Option<BlobResponse>;

    /// Persist a blob received from the network, verifying the CID before writing.
    async fn put(
        &self,
        expected_cid: &str,
        space_id: Option<&str>,
        bytes: &[u8],
        mime: &str,
    ) -> SomaResult<bool>;

    /// Begin a streaming write for large blobs. Returns `None` when streaming is unsupported.
    async fn open_streaming_put(
        &self,
        _expected_cid: &str,
        _space_id: Option<&str>,
        _total_size: u64,
    ) -> SomaResult<Option<BlobWriteInit>> {
        Ok(None)
    }
}

/// Helper for computing the SHA-256 CID for a blob's bytes.
pub fn cid_for(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}
