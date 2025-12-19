use clap::{Parser, Subcommand};
use libp2p::Multiaddr;
use std::path::PathBuf;

use soma_net::default_identity_path;

/// CLI arguments for the daemon.
#[derive(Debug, Parser)]
#[command(name = "soma-daemon", version)]
pub struct Args {
    #[command(subcommand)]
    pub cmd: Option<Command>,

    /// Unix socket path for desktop IPC.
    #[arg(long, env = "SOMA_DAEMON_SOCKET", default_value = "./soma-daemon.sock")]
    pub socket_path: PathBuf,

    /// Blob storage directory used by the daemon.
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

    /// Disable local mDNS discovery.
    #[arg(long, env = "SOMA_DISABLE_MDNS", default_value_t = false)]
    pub disable_mdns: bool,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Generate the daemon identity and exit.
    GenerateIdentity {
        /// Optional path override for the identity file.
        #[arg(long)]
        path: Option<std::path::PathBuf>,
    },
}

/// Daemon runtime configuration.
#[derive(Debug, Clone)]
pub struct DaemonConfig {
    pub socket_path: PathBuf,
    pub blob_dir: PathBuf,
    pub identity_path: PathBuf,
    pub listen_addrs: Vec<Multiaddr>,
    pub bootstrap_addrs: Vec<Multiaddr>,
    pub rendezvous_addrs: Vec<Multiaddr>,
    pub relay_addrs: Vec<Multiaddr>,
    pub enable_mdns: bool,
}

impl DaemonConfig {
    pub fn from_args(args: &Args) -> Self {
        Self {
            socket_path: args.socket_path.clone(),
            blob_dir: args.blob_dir.clone(),
            identity_path: default_identity_path("daemon"),
            listen_addrs: args.listen_addrs.clone(),
            bootstrap_addrs: args.bootstrap_addrs.clone(),
            rendezvous_addrs: args.rendezvous_addrs.clone(),
            relay_addrs: args.relay_addrs.clone(),
            enable_mdns: !args.disable_mdns,
        }
    }
}

impl From<&Args> for DaemonConfig {
    fn from(args: &Args) -> Self {
        DaemonConfig::from_args(args)
    }
}

pub fn default_listen_addrs() -> Vec<Multiaddr> {
    vec![
        "/ip4/0.0.0.0/tcp/14007"
            .parse()
            .expect("valid tcp multiaddr"),
        "/ip4/0.0.0.0/udp/14207/quic-v1"
            .parse()
            .expect("valid quic multiaddr"),
        "/ip4/0.0.0.0/tcp/14107/ws"
            .parse()
            .expect("valid websocket multiaddr"),
    ]
}
