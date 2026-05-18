use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

use async_trait::async_trait;
use soma_membership::{JoinPolicy, build_join_decider};
use soma_net::NetIdentity;
use soma_peer::{PeerConfig, SpaceAuthorizer, bootstrap::PeerBootstrapper, join::JoinDecider};
use soma_storage::RepositoryProvider;
use soma_vdfs::BlobProvider;

pub(crate) struct DaemonPeerBootstrap {
    pub(crate) identity_path: PathBuf,
    pub(crate) listen_addrs: Vec<libp2p::Multiaddr>,
    pub(crate) bootstrap_addrs: Vec<libp2p::Multiaddr>,
    pub(crate) rendezvous_addrs: Vec<libp2p::Multiaddr>,
    pub(crate) relay_addrs: Vec<libp2p::Multiaddr>,
    pub(crate) enable_mdns: bool,
    pub(crate) blob_provider: Arc<dyn BlobProvider>,
    pub(crate) repos: Arc<dyn RepositoryProvider>,
}

#[derive(Clone)]
struct StorageSpaceAuthorizer {
    repos: Arc<dyn RepositoryProvider>,
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

impl PeerBootstrapper for DaemonPeerBootstrap {
    fn identity_path(&self) -> &Path {
        &self.identity_path
    }

    fn build_config(&self, identity: &NetIdentity) -> PeerConfig {
        let join_decider: Arc<dyn JoinDecider> = build_join_decider(
            &self.repos,
            identity.keypair().clone(),
            identity.peer_id(),
            JoinPolicy::manual_only(),
        );

        PeerConfig::builder()
            .identity_path(self.identity_path.clone())
            .listen_addrs(self.listen_addrs.clone())
            .bootstrap_addrs(self.bootstrap_addrs.clone())
            .rendezvous_nodes(self.rendezvous_addrs.clone())
            .relay_addrs(self.relay_addrs.clone())
            .enable_mdns(self.enable_mdns)
            .join_decider(join_decider)
            .blob_provider(self.blob_provider.clone())
            .space_authorizer(Arc::new(StorageSpaceAuthorizer {
                repos: self.repos.clone(),
            }) as Arc<dyn SpaceAuthorizer>)
            .build()
            .expect("peer config")
    }
}
