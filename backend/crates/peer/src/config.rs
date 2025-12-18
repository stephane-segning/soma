use derive_builder::Builder;
use libp2p::Multiaddr;
use std::path::PathBuf;

use soma_net::default_identity_path;

/// Common peer configuration shared by daemon/bot/bff peers.
#[derive(Debug, Clone, Builder)]
#[builder(pattern = "owned", setter(into, strip_option))]
pub struct PeerConfig {
    #[builder(default = "default_identity_path(\"peer\")")]
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
        Self::builder()
            .identity_path(default_identity_path(service))
            .build()
            .expect("peer config")
    }
}
