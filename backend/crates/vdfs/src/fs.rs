use std::{io::SeekFrom, path::PathBuf, sync::Arc};

use sha2::{Digest, Sha256};
use soma_core::{Error, SomaResult};
use tokio::{
    fs,
    io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt},
};

use crate::{BlobProvider, BlobRange, BlobResponse, BlobWriteInit, BlobWriteStream, cid_for};

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
    async fn get(
        &self,
        cid: &str,
        space_id: Option<&str>,
        range: BlobRange,
    ) -> Option<BlobResponse> {
        let space = space_id.unwrap_or("");
        if space.is_empty() {
            return None;
        }

        let path = self.path_for(space, cid);
        if !fs::try_exists(&path).await.ok()? {
            return None;
        }

        // Stream only the requested slice to keep memory bounded.
        let mut file = fs::File::open(&path).await.ok()?;
        let meta = file.metadata().await.ok()?;
        let total_size = meta.len();
        let offset = range.offset.min(total_size);
        let desired_len = range
            .length
            .unwrap_or_else(|| total_size.saturating_sub(offset) as usize);
        let max_len = desired_len.min(crate::MAX_BLOB_MESSAGE_BYTES.saturating_sub(1024));

        if max_len == 0 {
            return None;
        }

        let mut buf = vec![0u8; max_len];
        if file.seek(SeekFrom::Start(offset)).await.is_err() {
            return None;
        }
        let read = file.read(&mut buf).await.ok()?;
        buf.truncate(read);

        Some(BlobResponse {
            cid: cid.to_string(),
            mime: "application/octet-stream".to_string(),
            size: total_size,
            data: buf,
            found: true,
            space_id: space.to_string(),
            offset,
            eof: offset + read as u64 >= total_size,
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

    async fn open_streaming_put(
        &self,
        expected_cid: &str,
        space_id: Option<&str>,
        total_size: u64,
    ) -> SomaResult<Option<BlobWriteInit>> {
        let space = space_id.unwrap_or("");
        if space.is_empty() {
            return Ok(None);
        }

        let final_path = self.path_for(space, expected_cid);
        if fs::try_exists(&final_path).await? {
            return Ok(Some(BlobWriteInit::AlreadyPresent));
        }

        if let Some(parent) = final_path.parent() {
            fs::create_dir_all(parent).await?;
        }

        let tmp_path = final_path.with_extension("part");
        let file = fs::File::create(&tmp_path).await?;

        Ok(Some(BlobWriteInit::Started(Box::new(FsBlobWriter {
            expected_cid: expected_cid.to_string(),
            tmp_path,
            final_path,
            file,
            hasher: Sha256::new(),
            written: 0,
            total_size,
        }))))
    }
}

struct FsBlobWriter {
    expected_cid: String,
    tmp_path: PathBuf,
    final_path: PathBuf,
    file: fs::File,
    hasher: Sha256,
    written: u64,
    total_size: u64,
}

#[async_trait::async_trait]
impl BlobWriteStream for FsBlobWriter {
    async fn write_chunk(&mut self, offset: u64, bytes: &[u8]) -> SomaResult<()> {
        if offset != self.written {
            return Err(Error::service("out-of-order blob chunk"));
        }

        self.file.write_all(bytes).await?;
        self.written += bytes.len() as u64;
        self.hasher.update(bytes);
        Ok(())
    }

    async fn finish(mut self: Box<Self>) -> SomaResult<bool> {
        self.file.sync_all().await?;
        if self.written != self.total_size {
            let _ = fs::remove_file(&self.tmp_path).await;
            return Ok(false);
        }

        let cid = format!("{:x}", self.hasher.finalize());
        if cid != self.expected_cid {
            let _ = fs::remove_file(&self.tmp_path).await;
            return Ok(false);
        }

        if fs::try_exists(&self.final_path).await.unwrap_or(false) {
            let _ = fs::remove_file(&self.tmp_path).await;
            return Ok(true);
        }

        fs::rename(&self.tmp_path, &self.final_path).await?;
        Ok(true)
    }

    async fn abort(self: Box<Self>) {
        let _ = fs::remove_file(&self.tmp_path).await;
    }
}
