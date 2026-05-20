//! `soma-blob://<space-id>/<cid>` URI scheme handler. Replaces the
//! `protocol.registerBufferProtocol("soma-blob", ...)` registration from
//! `desktop/soma/src/main/services/blob-protocol.ts`.
//!
//! The crate is intentionally daemon-agnostic: callers pass a [`BlobReader`]
//! trait object, so `desktop-daemon` (which actually owns the
//! `soma-daemon::Handle`) can wire itself in without `desktop-services`
//! pulling in `soma-daemon`. The registration helper is consumed by
//! `desktop-app`'s Tauri builder.

use std::sync::Arc;

use async_trait::async_trait;
use desktop_core::error::{DesktopError, DesktopResult};

pub const SCHEME: &str = "soma-blob";

#[derive(Debug, Clone)]
pub struct ReadBlob {
    pub data: Vec<u8>,
    pub mime: String,
}

/// Abstraction over whatever owns the byte source. The real implementation
/// lives in `desktop-daemon` and delegates to `soma-daemon::Handle::read_blob`.
#[async_trait]
pub trait BlobReader: Send + Sync + 'static {
    async fn read_blob(&self, space_id: &str, cid: &str) -> DesktopResult<ReadBlob>;
}

pub type SharedBlobReader = Arc<dyn BlobReader>;

/// Parse `soma-blob://<space-id>/<cid>` into its parts. Returns
/// `InvalidInput` on malformed URLs so the protocol responder can map to an
/// `ERR_INVALID_URL`-shaped response.
pub fn parse(url: &str) -> DesktopResult<(String, String)> {
    let rest = url
        .strip_prefix(&format!("{SCHEME}://"))
        .ok_or_else(|| DesktopError::invalid(format!("expected {SCHEME}:// prefix")))?;
    // The leading `/` after the host segment isn't always present; we accept
    // either `host/space/cid` (no leading slash on path) or `host/space/cid`
    // (with the legacy electron URL shape that used `daemon` as the host).
    let mut parts = rest.trim_start_matches('/').splitn(3, '/').filter(|s| !s.is_empty());
    let first = parts
        .next()
        .ok_or_else(|| DesktopError::invalid("missing space id"))?;
    let second = parts
        .next()
        .ok_or_else(|| DesktopError::invalid("missing cid"))?;
    // Old format embedded "daemon" as the host: `soma-blob://daemon/<space>/<cid>`.
    let third = parts.next();
    let (space_id, cid) = match third {
        Some(third) if !third.is_empty() => (second.to_string(), third.to_string()),
        _ => (first.to_string(), second.to_string()),
    };
    Ok((space_id, cid))
}
