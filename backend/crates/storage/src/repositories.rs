use std::sync::Arc;

use sqlx_utils::types::Pool;

use crate::{
    agent_config::AgentConfigRepository, blobs::BlobRepository, documents::DocumentRepository,
    invites::InviteRepository, issuer::IssuerRepository, mailbox::MailboxRepository,
    membership::MembershipRepository, pages::PageRepository, peers::PeerPublicKeyRepository,
    search::SearchRepository,
};

/// Abstraction over repositories needed by controllers/services.
pub trait RepositoryProvider: Send + Sync {
    fn membership_repo(&self) -> Arc<dyn MembershipRepository>;
    fn issuer_repo(&self) -> Arc<dyn IssuerRepository>;
    fn invite_repo(&self) -> Arc<dyn InviteRepository>;
    fn mailbox_repo(&self) -> Arc<dyn MailboxRepository>;
    fn peer_keys_repo(&self) -> Arc<dyn PeerPublicKeyRepository>;
    fn document_repo(&self) -> Arc<dyn DocumentRepository>;
    fn page_repo(&self) -> Arc<dyn PageRepository>;
    fn blob_repo(&self) -> Arc<dyn BlobRepository>;
    fn agent_config_repo(&self) -> Arc<dyn AgentConfigRepository>;
    fn search_repo(&self) -> Arc<dyn SearchRepository>;
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

    pub fn membership(&self) -> crate::membership::SqlMembershipRepository {
        crate::membership::SqlMembershipRepository::new(self.pool.clone())
    }

    pub fn issuer(&self) -> crate::issuer::SqlIssuerRepository {
        crate::issuer::SqlIssuerRepository::new(self.pool.clone())
    }

    pub fn invites(&self) -> crate::invites::SqlInviteRepository {
        crate::invites::SqlInviteRepository::new(self.pool.clone())
    }

    pub fn mailbox(&self) -> crate::mailbox::SqlMailboxRepository {
        crate::mailbox::SqlMailboxRepository::new(self.pool.clone())
    }

    pub fn peer_keys(&self) -> crate::peers::SqlPeerPublicKeyRepository {
        crate::peers::SqlPeerPublicKeyRepository::new(self.pool.clone())
    }

    pub fn documents(&self) -> crate::documents::SqlDocumentRepository {
        crate::documents::SqlDocumentRepository::new(self.pool.clone())
    }

    pub fn pages(&self) -> crate::pages::SqlPageRepository {
        crate::pages::SqlPageRepository::new(self.pool.clone())
    }

    pub fn blobs(&self) -> crate::blobs::SqlBlobRepository {
        crate::blobs::SqlBlobRepository::new(self.pool.clone())
    }

    pub fn agent_config(&self) -> crate::agent_config::SqlAgentConfigRepository {
        crate::agent_config::SqlAgentConfigRepository::new(self.pool.clone())
    }

    pub fn search(&self) -> crate::search::SqlSearchRepository {
        crate::search::SqlSearchRepository::new(self.pool.clone())
    }
}

impl RepositoryProvider for RepositoryFactory {
    fn membership_repo(&self) -> Arc<dyn MembershipRepository> {
        Arc::new(self.membership())
    }

    fn issuer_repo(&self) -> Arc<dyn IssuerRepository> {
        Arc::new(self.issuer())
    }

    fn invite_repo(&self) -> Arc<dyn InviteRepository> {
        Arc::new(self.invites())
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

    fn agent_config_repo(&self) -> Arc<dyn AgentConfigRepository> {
        Arc::new(self.agent_config())
    }

    fn search_repo(&self) -> Arc<dyn SearchRepository> {
        Arc::new(self.search())
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

    fn invite_repo(&self) -> Arc<dyn InviteRepository> {
        (**self).invite_repo()
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

    fn agent_config_repo(&self) -> Arc<dyn AgentConfigRepository> {
        (**self).agent_config_repo()
    }

    fn search_repo(&self) -> Arc<dyn SearchRepository> {
        (**self).search_repo()
    }

    fn pool(&self) -> Pool {
        (**self).pool()
    }
}
