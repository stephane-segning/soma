use std::path::PathBuf;

use sha2::{Digest, Sha256};
use soma_core::{Error, SomaResult};
use tokio::{fs, io::AsyncWriteExt};

use crate::BlobWriteStream;

pub(super) struct FsBlobWriter {
    expected_cid: String,
    tmp_path: PathBuf,
    final_path: PathBuf,
    file: fs::File,
    hasher: Sha256,
    written: u64,
    total_size: u64,
}

impl FsBlobWriter {
    pub(super) fn new(
        expected_cid: String,
        tmp_path: PathBuf,
        final_path: PathBuf,
        file: fs::File,
        total_size: u64,
    ) -> Self {
        Self {
            expected_cid,
            tmp_path,
            final_path,
            file,
            hasher: Sha256::new(),
            written: 0,
            total_size,
        }
    }
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
