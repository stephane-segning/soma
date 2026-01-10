use std::{
    fs,
    path::{Path, PathBuf},
    sync::Arc,
};

use soma_core::SomaResult;
use sqlx_utils::types::Pool;

pub mod bootstrap;
pub mod blobs;
pub mod documents;
pub mod issuer;
pub mod mailbox;
pub mod membership;
pub mod pages;
pub mod peers;
use crate::{
    blobs::BlobRepository,
    documents::DocumentRepository, issuer::IssuerRepository, mailbox::MailboxRepository,
    membership::MembershipRepository, pages::PageRepository, peers::PeerPublicKeyRepository,
};

/// Abstraction over repositories needed by controllers/services.
pub trait RepositoryProvider: Send + Sync {
    fn membership_repo(&self) -> Arc<dyn MembershipRepository>;
    fn issuer_repo(&self) -> Arc<dyn IssuerRepository>;
    fn mailbox_repo(&self) -> Arc<dyn MailboxRepository>;
    fn peer_keys_repo(&self) -> Arc<dyn PeerPublicKeyRepository>;
    fn document_repo(&self) -> Arc<dyn DocumentRepository>;
    fn page_repo(&self) -> Arc<dyn PageRepository>;
    fn blob_repo(&self) -> Arc<dyn BlobRepository>;
    fn pool(&self) -> Pool;
}

/// Factory to build repository instances backed by a shared `AnyPool`.
#[derive(Clone, Debug)]
pub struct RepositoryFactory {
    pool: Pool,
}

impl RepositoryFactory {
    pub fn new(pool: Pool) -> Self {
        Self { pool }
    }

    pub fn pool(&self) -> Pool {
        self.pool.clone()
    }

    pub fn membership(&self) -> membership::SqlMembershipRepository {
        membership::SqlMembershipRepository::new(self.pool.clone())
    }

    pub fn issuer(&self) -> issuer::SqlIssuerRepository {
        issuer::SqlIssuerRepository::new(self.pool.clone())
    }

    pub fn mailbox(&self) -> mailbox::SqlMailboxRepository {
        mailbox::SqlMailboxRepository::new(self.pool.clone())
    }

    pub fn peer_keys(&self) -> peers::SqlPeerPublicKeyRepository {
        peers::SqlPeerPublicKeyRepository::new(self.pool.clone())
    }

    pub fn documents(&self) -> documents::SqlDocumentRepository {
        documents::SqlDocumentRepository::new(self.pool.clone())
    }

    pub fn pages(&self) -> pages::SqlPageRepository {
        pages::SqlPageRepository::new(self.pool.clone())
    }

    pub fn blobs(&self) -> blobs::SqlBlobRepository {
        blobs::SqlBlobRepository::new(self.pool.clone())
    }
}

impl RepositoryProvider for RepositoryFactory {
    fn membership_repo(&self) -> Arc<dyn MembershipRepository> {
        Arc::new(self.membership())
    }

    fn issuer_repo(&self) -> Arc<dyn IssuerRepository> {
        Arc::new(self.issuer())
    }

    fn mailbox_repo(&self) -> Arc<dyn MailboxRepository> {
        Arc::new(self.mailbox())
    }

    fn peer_keys_repo(&self) -> Arc<dyn PeerPublicKeyRepository> {
        Arc::new(self.peer_keys())
    }

    fn document_repo(&self) -> Arc<dyn DocumentRepository> {
        Arc::new(self.documents())
    }

    fn page_repo(&self) -> Arc<dyn PageRepository> {
        Arc::new(self.pages())
    }

    fn blob_repo(&self) -> Arc<dyn BlobRepository> {
        Arc::new(self.blobs())
    }

    fn pool(&self) -> Pool {
        self.pool()
    }
}

impl<T> RepositoryProvider for Arc<T>
where
    T: RepositoryProvider + ?Sized,
{
    fn membership_repo(&self) -> Arc<dyn MembershipRepository> {
        (**self).membership_repo()
    }

    fn issuer_repo(&self) -> Arc<dyn IssuerRepository> {
        (**self).issuer_repo()
    }

    fn mailbox_repo(&self) -> Arc<dyn MailboxRepository> {
        (**self).mailbox_repo()
    }

    fn peer_keys_repo(&self) -> Arc<dyn PeerPublicKeyRepository> {
        (**self).peer_keys_repo()
    }

    fn document_repo(&self) -> Arc<dyn DocumentRepository> {
        (**self).document_repo()
    }

    fn page_repo(&self) -> Arc<dyn PageRepository> {
        (**self).page_repo()
    }

    fn blob_repo(&self) -> Arc<dyn BlobRepository> {
        (**self).blob_repo()
    }

    fn pool(&self) -> Pool {
        (**self).pool()
    }
}

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
