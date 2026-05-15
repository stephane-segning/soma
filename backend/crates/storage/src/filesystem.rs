use std::{
    fs,
    path::{Component, Path, PathBuf},
};

use soma_core::{Error, SomaResult};

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
        let path = self.blob_path(name)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&path, data)?;
        Ok(path)
    }

    /// Read a blob if it exists.
    pub fn read_blob(&self, name: &str) -> SomaResult<Option<Vec<u8>>> {
        let path = self.blob_path(name)?;
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

    fn blob_path(&self, name: &str) -> SomaResult<PathBuf> {
        let sanitized = name.replace(['/', '\\'], "_");
        validate_blob_name(&sanitized)?;
        Ok(self.blobs.join(sanitized))
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

fn validate_blob_name(name: &str) -> SomaResult<()> {
    let mut components = Path::new(name).components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(component)), None) if !component.is_empty() => Ok(()),
        _ => Err(Error::service("invalid blob name")),
    }
}

#[cfg(test)]
mod tests {
    use super::Storage;

    #[test]
    fn rejects_parent_dir_blob_name() {
        let store = Storage::open(tempfile::tempdir().unwrap().path()).unwrap();
        assert!(store.write_blob("..", b"bad").is_err());
        assert!(store.read_blob("..").is_err());
    }

    #[test]
    fn rejects_current_dir_and_empty_blob_names() {
        let store = Storage::open(tempfile::tempdir().unwrap().path()).unwrap();
        assert!(store.write_blob(".", b"bad").is_err());
        assert!(store.write_blob("", b"bad").is_err());
    }

    #[test]
    fn sanitizes_path_separators_into_single_blob_name() {
        let store = Storage::open(tempfile::tempdir().unwrap().path()).unwrap();
        let path = store.write_blob("../secret", b"ok").unwrap();
        assert_eq!(path.file_name().unwrap(), ".._secret");
        assert_eq!(store.read_blob("../secret").unwrap(), Some(b"ok".to_vec()));
    }
}
