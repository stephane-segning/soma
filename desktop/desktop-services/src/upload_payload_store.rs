//! Staging area for renderer-to-daemon uploads. Mirrors
//! `desktop/soma/src/main/services/upload-payload-store.ts`:
//! the renderer sends raw bytes once, we drop them under
//! `userData/tmp/uploads/<cuid>.bin`, the documents/blobs controller picks
//! them up later, and we delete on success/failure.
//!
//! The path-traversal guard from the TS version is preserved: every
//! `read`/`remove` resolves the candidate against `base_dir` and rejects
//! anything that escapes the prefix.

use std::path::{Path, PathBuf};

use desktop_core::error::{DesktopError, DesktopResult};
use serde::Serialize;
use specta::Type;
use tokio::fs;

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StagedUpload {
    pub payload_path: PathBuf,
    #[specta(type = i32)]
    pub byte_length: u64,
    pub mime: String,
    pub file_name: Option<String>,
    #[specta(type = i32)]
    pub created_at_ms: i64,
}

pub struct UploadPayloadStore {
    base_dir: PathBuf,
}

impl UploadPayloadStore {
    pub fn new(base_dir: impl Into<PathBuf>) -> Self {
        Self { base_dir: base_dir.into() }
    }

    pub async fn stage(&self, bytes: &[u8], mime: &str, file_name: Option<&str>) -> DesktopResult<StagedUpload> {
        fs::create_dir_all(&self.base_dir).await?;
        let id = cuid2::create_id();
        let payload_path = self.base_dir.join(format!("{id}.bin"));
        fs::write(&payload_path, bytes).await?;
        Ok(StagedUpload {
            payload_path,
            byte_length: bytes.len() as u64,
            mime: mime.to_string(),
            file_name: file_name.map(str::to_owned),
            created_at_ms: now_ms(),
        })
    }

    pub async fn read(&self, payload_path: &Path) -> DesktopResult<Vec<u8>> {
        let safe = self.resolve(payload_path)?;
        let bytes = fs::read(safe).await?;
        Ok(bytes)
    }

    pub async fn remove(&self, payload_path: &Path) -> DesktopResult<()> {
        let safe = self.resolve(payload_path)?;
        match fs::remove_file(safe).await {
            Ok(()) => Ok(()),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(err) => Err(err.into()),
        }
    }

    fn resolve(&self, payload_path: &Path) -> DesktopResult<PathBuf> {
        // We canonicalize against `base_dir` rather than the candidate so we
        // don't error if the file no longer exists (Path::canonicalize hits
        // the filesystem). Instead we normalize manually and check prefix.
        let candidate = if payload_path.is_absolute() {
            payload_path.to_path_buf()
        } else {
            self.base_dir.join(payload_path)
        };
        let base = std::fs::canonicalize(&self.base_dir).unwrap_or_else(|_| self.base_dir.clone());
        let candidate = normalize(&candidate);
        if !candidate.starts_with(&base) {
            return Err(DesktopError::invalid("upload payload path escapes the staging dir"));
        }
        Ok(candidate)
    }
}

fn normalize(p: &Path) -> PathBuf {
    use std::path::Component;
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
