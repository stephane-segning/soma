use std::net::SocketAddr;

use clap::Parser;
use libp2p::Multiaddr;

#[derive(Debug, Parser)]
#[command(name = "soma-bffd", version)]
pub struct Args {
    #[arg(long, env = "HTTP_ADDR", default_value = "0.0.0.0:8083")]
    pub http_addr: SocketAddr,

    /// Enable optional libp2p peer (disabled by default).
    #[arg(long, env = "SOMA_P2P_ENABLE", default_value_t = false)]
    pub p2p_enable: bool,

    /// Listen multiaddrs for the optional peer.
    #[arg(long, env = "SOMA_P2P_LISTEN_ADDRS", value_delimiter = ',')]
    pub p2p_listen_addrs: Vec<Multiaddr>,

    /// Bootstrap peers for the optional peer.
    #[arg(long, env = "SOMA_P2P_BOOTSTRAP_ADDRS", value_delimiter = ',')]
    pub p2p_bootstrap_addrs: Vec<Multiaddr>,
}

pub fn default_listen_addrs() -> Vec<Multiaddr> {
    vec![
        "/ip4/0.0.0.0/tcp/14010"
            .parse()
            .expect("valid tcp multiaddr"),
        "/ip4/0.0.0.0/udp/14210/quic-v1"
            .parse()
            .expect("valid quic multiaddr"),
        "/ip4/0.0.0.0/tcp/14110/ws"
            .parse()
            .expect("valid ws multiaddr"),
    ]
}
