use std::{path::PathBuf, sync::Arc};

use soma_core::SomaResult;
use soma_vdfs::{BlobProvider, BlobResponse, cid_for};
use tokio::fs;

/// Simple content-addressed blob store rooted at a directory.
#[derive(Debug, Clone)]
pub struct BlobStore {
    root: Arc<PathBuf>,
}

#[derive(Debug, Clone)]
pub struct BlobWriteResult {
    pub cid: String,
    pub size: u64,
    pub path: PathBuf,
}

impl BlobStore {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root: Arc::new(root),
        }
    }

    /// Compute the content hash for a blob.
    /// Location for a given space + cid.
    pub fn path_for(&self, space_id: &str, cid: &str) -> PathBuf {
        self.root.join(space_id).join(cid)
    }

    /// Write a blob if it is not already present. Returns the cid and size.
    pub async fn write(&self, space_id: &str, bytes: &[u8]) -> SomaResult<BlobWriteResult> {
        let cid = cid_for(bytes);
        let size = bytes.len() as u64;
        let path = self.path_for(space_id, &cid);

        // Ensure parent exists.
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await?;
        }

        // Only write if missing.
        if !fs::try_exists(&path).await? {
            fs::write(&path, bytes).await?;
        }

        Ok(BlobWriteResult { cid, size, path })
    }

    /// Read a blob if present.
    pub async fn read(&self, space_id: &str, cid: &str) -> SomaResult<Option<Vec<u8>>> {
        let path = self.path_for(space_id, cid);
        if fs::try_exists(&path).await? {
            Ok(Some(fs::read(path).await?))
        } else {
            Ok(None)
        }
    }
}

#[async_trait::async_trait]
impl BlobProvider for BlobStore {
    async fn get(&self, cid: &str, space_id: Option<&str>) -> Option<BlobResponse> {
        let space = space_id.unwrap_or("");
        if space.is_empty() {
            return None;
        }
        let Ok(bytes_opt) = self.read(space, cid).await else {
            return None;
        };
        let bytes = bytes_opt?;
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
        mime: &str,
    ) -> SomaResult<bool> {
        let space = space_id.unwrap_or("");
        if space.is_empty() {
            return Ok(false);
        }
        let computed = cid_for(bytes);
        if computed != expected_cid {
            return Ok(false);
        }
        let res = self.write(space, bytes).await?;
        // Only count as stored if MIME is non-empty (caller provided something) and write succeeded.
        Ok(!res.path.as_os_str().is_empty() && !mime.is_empty())
    }
}
