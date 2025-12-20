use std::{path::PathBuf, sync::Arc};

use sha2::{Digest, Sha256};
use soma_core::SomaResult;
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
