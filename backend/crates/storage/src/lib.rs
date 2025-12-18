use std::{
    fs,
    path::{Path, PathBuf},
};

use soma_core::SomaResult;

/// Basic filesystem-backed storage used by daemons and bots.
///
/// The storage layout is intentionally simple for now: a single root with a `blobs/`
/// subdirectory. Future structured data (SQLite/Postgres) can hang off this root.
#[derive(Debug, Clone)]
pub struct Storage {
    root: PathBuf,
    blobs: PathBuf,
}

impl Storage {
    /// Create the storage directories if they do not already exist.
    pub fn open(root: impl AsRef<Path>) -> SomaResult<Self> {
        let root = root.as_ref().to_path_buf();
        let blobs = root.join("blobs");
        fs::create_dir_all(&blobs)?;
        Ok(Self { root, blobs })
    }

    /// Persist a blob to disk and return its absolute path.
    pub fn write_blob(&self, name: &str, data: &[u8]) -> SomaResult<PathBuf> {
        let path = self.blob_path(name);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&path, data)?;
        Ok(path)
    }

    /// Read a blob if it exists.
    pub fn read_blob(&self, name: &str) -> SomaResult<Option<Vec<u8>>> {
        let path = self.blob_path(name);
        if path.exists() {
            Ok(Some(fs::read(path)?))
        } else {
            Ok(None)
        }
    }

    /// List all blob filenames (non-recursive).
    pub fn list_blobs(&self) -> SomaResult<Vec<String>> {
        let mut entries = Vec::new();
        for entry in fs::read_dir(&self.blobs)? {
            let entry = entry?;
            if entry.file_type()?.is_file() {
                if let Some(name) = entry.file_name().to_str() {
                    entries.push(name.to_string());
                }
            }
        }
        entries.sort();
        Ok(entries)
    }

    fn blob_path(&self, name: &str) -> PathBuf {
        // Prevent path traversal while still allowing descriptive names.
        let sanitized = name.replace(['/', '\\'], "_");
        self.blobs.join(sanitized)
    }

    /// Expose the root directory for callers that need to create structured stores.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Expose the blob directory.
    pub fn blobs(&self) -> &Path {
        &self.blobs
    }
}
