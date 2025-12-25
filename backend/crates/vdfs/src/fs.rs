use std::{path::PathBuf, sync::Arc};

use soma_core::{Error, SomaResult};
use tokio::fs;

use crate::{BlobProvider, BlobResponse, cid_for};

/// A filesystem-backed, content-addressed blob store.
///
/// - Layout: `<root>/<space_id>/<cid>`
/// - Writes are idempotent (`put` and `write_local` do not overwrite).
/// - `put` verifies bytes match the claimed CID before persisting.
#[derive(Debug, Clone)]
pub struct FsBlobStore {
    root: Arc<PathBuf>,
}

#[derive(Debug, Clone)]
pub struct BlobWriteResult {
    pub cid: String,
    pub size: u64,
    pub path: PathBuf,
}

impl FsBlobStore {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root: Arc::new(root),
        }
    }

    pub fn path_for(&self, space_id: &str, cid: &str) -> PathBuf {
        self.root.join(space_id).join(cid)
    }

    pub async fn write_local(&self, space_id: &str, bytes: &[u8]) -> SomaResult<BlobWriteResult> {
        if space_id.is_empty() {
            return Err(Error::service("space_id required"));
        }

        let cid = cid_for(bytes);
        let size = bytes.len() as u64;
        let path = self.path_for(space_id, &cid);

        self.write_if_missing(&path, bytes).await?;

        Ok(BlobWriteResult { cid, size, path })
    }

    pub async fn read(&self, space_id: &str, cid: &str) -> SomaResult<Option<Vec<u8>>> {
        let path = self.path_for(space_id, cid);
        if fs::try_exists(&path).await? {
            Ok(Some(fs::read(path).await?))
        } else {
            Ok(None)
        }
    }

    async fn write_if_missing(&self, path: &PathBuf, bytes: &[u8]) -> SomaResult<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await?;
        }
        if !fs::try_exists(path).await? {
            fs::write(path, bytes).await?;
        }
        Ok(())
    }
}

#[async_trait::async_trait]
impl BlobProvider for FsBlobStore {
    async fn get(&self, cid: &str, space_id: Option<&str>) -> Option<BlobResponse> {
        let space = space_id.unwrap_or("");
        if space.is_empty() {
            return None;
        }

        let bytes = self.read(space, cid).await.ok()??;

        Some(BlobResponse {
            cid: cid.to_string(),
            mime: "application/octet-stream".to_string(),
            size: bytes.len() as u64,
            data: bytes,
            found: true,
            space_id: space.to_string(),
        })
    }

    async fn put(
        &self,
        expected_cid: &str,
        space_id: Option<&str>,
        bytes: &[u8],
        _mime: &str,
    ) -> SomaResult<bool> {
        let space = space_id.unwrap_or("");
        if space.is_empty() {
            return Ok(false);
        }

        let computed = cid_for(bytes);
        if computed != expected_cid {
            return Ok(false);
        }

        let path = self.path_for(space, expected_cid);
        self.write_if_missing(&path, bytes).await?;
        Ok(true)
    }
}

