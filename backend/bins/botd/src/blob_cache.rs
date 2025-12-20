use std::{path::PathBuf, sync::Arc};

use sha2::{Digest, Sha256};
use soma_core::SomaResult;
use soma_peer::{BlobProvider, BlobResponse};
use tokio::fs;

/// Cache-only content-addressed blob store for botd.
#[derive(Debug, Clone)]
pub struct BlobCache {
    root: Arc<PathBuf>,
}

impl BlobCache {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root: Arc::new(root),
        }
    }

    fn cid_for(bytes: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        let digest = hasher.finalize();
        format!("{:x}", digest)
    }

    fn path_for(&self, space_id: &str, cid: &str) -> PathBuf {
        self.root.join(space_id).join(cid)
    }

    async fn write(&self, space_id: &str, cid: &str, bytes: &[u8]) -> SomaResult<()> {
        let path = self.path_for(space_id, cid);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await?;
        }
        if !fs::try_exists(&path).await? {
            fs::write(&path, bytes).await?;
        }
        Ok(())
    }

    async fn read(&self, space_id: &str, cid: &str) -> SomaResult<Option<Vec<u8>>> {
        let path = self.path_for(space_id, cid);
        if fs::try_exists(&path).await? {
            Ok(Some(fs::read(path).await?))
        } else {
            Ok(None)
        }
    }
}

#[async_trait::async_trait]
impl BlobProvider for BlobCache {
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
        let computed = Self::cid_for(bytes);
        if computed != expected_cid {
            return Ok(false);
        }
        self.write(space, expected_cid, bytes).await?;
        Ok(!mime.is_empty())
    }
}
