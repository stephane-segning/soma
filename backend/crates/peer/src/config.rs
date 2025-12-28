use derive_builder::Builder;
use libp2p::Multiaddr;
use std::{path::PathBuf, sync::Arc};

use crate::{
    BlobProvider,
    join::{JoinDecider, default_join_decider},
};
use soma_net::IdentityManager;

/// Common peer configuration shared by daemon/bot/bff peers.
#[derive(Clone, Builder)]
#[builder(pattern = "owned", setter(into, strip_option))]
pub struct PeerConfig {
    #[builder(default = "IdentityManager::from_env().default_identity_path(\"peer\")")]
    pub identity_path: PathBuf,

    #[builder(default)]
    pub listen_addrs: Vec<Multiaddr>,

    #[builder(default)]
    pub bootstrap_addrs: Vec<Multiaddr>,

    #[builder(default)]
    pub rendezvous_nodes: Vec<Multiaddr>,

    #[builder(default)]
    pub relay_addrs: Vec<Multiaddr>,

    #[builder(default = "Some(\"soma\".to_string())")]
    pub rendezvous_namespace: Option<String>,

    #[builder(default = "true")]
    pub enable_mdns: bool,

    #[builder(default = "default_join_decider()")]
    pub join_decider: Arc<dyn JoinDecider>,

    #[builder(default)]
    pub blob_provider: Option<Arc<dyn BlobProvider>>,
}

impl PeerConfig {
    pub fn builder() -> PeerConfigBuilder {
        PeerConfigBuilder::default()
    }

    pub fn new(identity_path: PathBuf) -> Self {
        Self::builder()
            .identity_path(identity_path)
            .build()
            .expect("peer config")
    }

    pub fn with_identity(service: &str) -> Self {
        let idm = IdentityManager::from_env();
        Self::builder()
            .identity_path(idm.default_identity_path(service))
            .build()
            .expect("peer config")
    }
}
