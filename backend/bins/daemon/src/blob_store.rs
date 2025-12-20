use std::{path::PathBuf, sync::Arc};

use sha2::{Digest, Sha256};
use soma_core::SomaResult;
use soma_peer::BlobProvider;
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
    pub fn cid_for(bytes: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        let digest = hasher.finalize();
        format!("{:x}", digest)
    }

    /// Location for a given space + cid.
    pub fn path_for(&self, space_id: &str, cid: &str) -> PathBuf {
        self.root.join(space_id).join(cid)
    }

    /// Write a blob if it is not already present. Returns the cid and size.
    pub async fn write(&self, space_id: &str, bytes: &[u8]) -> SomaResult<BlobWriteResult> {
        let cid = Self::cid_for(bytes);
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
    async fn get(&self, cid: &str, space_id: Option<&str>) -> Option<soma_peer::BlobResponse> {
        let space = space_id.unwrap_or("");
        if space.is_empty() {
            return None;
        }
        let Ok(bytes_opt) = self.read(space, cid).await else {
            return None;
        };
        let bytes = bytes_opt?;
        Some(soma_peer::BlobResponse {
            cid: cid.to_string(),
            mime: "application/octet-stream".to_string(),
            size: bytes.len() as u64,
            data: bytes,
            found: true,
        })
    }
}
