use clap::{Parser, Subcommand};
use libp2p::Multiaddr;
use std::{net::SocketAddr, path::PathBuf};

/// CLI for soma-botd.
#[derive(Debug, Parser)]
#[command(name = "soma-botd", version)]
pub struct Args {
    #[command(subcommand)]
    pub cmd: Option<Command>,

    #[arg(long, env = "HTTP_ADDR", default_value = "0.0.0.0:8080")]
    pub http_addr: SocketAddr,

    #[arg(long, env = "SOMA_BLOB_DIR", default_value = "./blobs")]
    pub blob_dir: PathBuf,

    /// Listen multiaddrs for libp2p.
    #[arg(
        long,
        env = "SOMA_LISTEN_ADDRS",
        value_delimiter = ',',
        default_values_t = default_listen_addrs()
    )]
    pub listen_addrs: Vec<Multiaddr>,

    /// Optional bootstrap peers to dial on startup.
    #[arg(long, env = "SOMA_BOOTSTRAP_ADDRS", value_delimiter = ',')]
    pub bootstrap_addrs: Vec<Multiaddr>,

    /// Rendezvous nodes to register/discover against.
    #[arg(long, env = "SOMA_RDV_ADDRS", value_delimiter = ',')]
    pub rendezvous_addrs: Vec<Multiaddr>,

    /// Relay nodes to reserve slots against.
    #[arg(long, env = "SOMA_RELAY_ADDRS", value_delimiter = ',')]
    pub relay_addrs: Vec<Multiaddr>,

    /// Disable mdns discovery (default on).
    #[arg(long, env = "SOMA_DISABLE_MDNS", default_value_t = false)]
    pub disable_mdns: bool,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Generate the botd identity and exit.
    GenerateIdentity {
        /// Optional path override for the identity file.
        #[arg(long)]
        path: Option<std::path::PathBuf>,
    },
}

#[derive(Debug, Clone)]
pub struct BotConfig {
    pub identity_path: PathBuf,
    pub blob_dir: PathBuf,
    pub http_addr: SocketAddr,
    pub listen_addrs: Vec<Multiaddr>,
    pub bootstrap_addrs: Vec<Multiaddr>,
    pub rendezvous_addrs: Vec<Multiaddr>,
    pub relay_addrs: Vec<Multiaddr>,
    pub enable_mdns: bool,
}

impl BotConfig {
    pub fn from_args(args: &Args) -> Self {
        Self {
            identity_path: soma_net::default_identity_path("bot"),
            blob_dir: args.blob_dir.clone(),
            http_addr: args.http_addr,
            listen_addrs: args.listen_addrs.clone(),
            bootstrap_addrs: args.bootstrap_addrs.clone(),
            rendezvous_addrs: args.rendezvous_addrs.clone(),
            relay_addrs: args.relay_addrs.clone(),
            enable_mdns: !args.disable_mdns,
        }
    }
}

pub fn default_listen_addrs() -> Vec<Multiaddr> {
    vec![
        "/ip4/0.0.0.0/tcp/14005"
            .parse()
            .expect("valid tcp multiaddr"),
        "/ip4/0.0.0.0/tcp/14105/ws"
            .parse()
            .expect("valid ws multiaddr"),
        "/ip4/0.0.0.0/udp/14205/quic-v1"
            .parse()
            .expect("valid quic multiaddr"),
    ]
}
