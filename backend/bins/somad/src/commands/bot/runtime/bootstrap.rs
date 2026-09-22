use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

use async_trait::async_trait;
use soma_membership::{JoinPolicy, build_join_decider};
use soma_net::NetIdentity;
use soma_peer::{
    DocumentSyncProvider, PeerConfig, RosterProvider, SpaceAuthorizer, bootstrap::PeerBootstrapper,
};
use soma_replication::{StorageDocumentSync, StorageRosterSync};
use soma_storage::RepositoryProvider;
use soma_vdfs::BlobProvider;

use crate::commands::bot::config::BotConfig;

pub(super) struct BotPeerBootstrap {
    pub(super) identity_path: PathBuf,
    pub(super) config: BotConfig,
    pub(super) blob_provider: Arc<dyn BlobProvider>,
    pub(super) repos: soma_storage::RepositoryFactory,
    pub(super) join_policy: JoinPolicy,
}

#[derive(Clone)]
struct StorageSpaceAuthorizer {
    repos: soma_storage::RepositoryFactory,
}

#[async_trait]
impl SpaceAuthorizer for StorageSpaceAuthorizer {
    async fn can_read_space(&self, peer: &libp2p::PeerId, space_id: &str) -> bool {
        let repo = self.repos.membership_repo();
        repo.get_membership(space_id, &peer.to_string())
            .await
            .map(|m| m.is_some())
            .unwrap_or(false)
    }
}

impl PeerBootstrapper for BotPeerBootstrap {
    fn identity_path(&self) -> &Path {
        &self.identity_path
    }

    fn build_config(&self, identity: &NetIdentity) -> PeerConfig {
        let join_decider = build_join_decider(
            &self.repos,
            identity.keypair().clone(),
            identity.peer_id(),
            self.join_policy,
        );

        PeerConfig::builder()
            .identity_path(self.identity_path.clone())
            .listen_addrs(self.config.listen_addrs.clone())
            .bootstrap_addrs(self.config.bootstrap_addrs.clone())
            .rendezvous_nodes(self.config.rendezvous_addrs.clone())
            .relay_addrs(self.config.relay_addrs.clone())
            .enable_mdns(self.config.enable_mdns)
            .join_decider(join_decider.clone())
            .blob_provider(self.blob_provider.clone())
            .space_authorizer(Arc::new(StorageSpaceAuthorizer {
                repos: self.repos.clone(),
            }) as Arc<dyn SpaceAuthorizer>)
            // A bot is the always-on availability story for a space: it
            // must mirror documents and rosters like any other member,
            // not just relay join decisions. `None` here (vs. the
            // daemon's `Some(events)`) is intentional — a bot has no
            // renderer to notify of a replicated document; see
            // `StorageDocumentSync`'s doc comment.
            .document_sync(Arc::new(StorageDocumentSync::new(
                Arc::new(self.repos.clone()) as Arc<dyn RepositoryProvider>,
                None,
            )) as Arc<dyn DocumentSyncProvider>)
            .roster(Arc::new(StorageRosterSync::new(
                Arc::new(self.repos.clone()) as Arc<dyn RepositoryProvider>,
                identity.peer_id(),
                identity.keypair().public(),
            )) as Arc<dyn RosterProvider>)
            .build()
            .expect("peer config")
    }
}
