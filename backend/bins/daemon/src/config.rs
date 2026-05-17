use clap::{Parser, Subcommand};
use libp2p::Multiaddr;
use std::path::PathBuf;

/// CLI arguments for the `soma-daemon` binary.
///
/// Lives in the library only because the binary shim re-imports it via the
/// `__bin` module; embedders should construct a [`crate::RuntimeConfig`]
/// directly instead.
#[derive(Debug, Parser)]
#[command(name = "soma-daemon", version)]
pub struct Args {
    #[command(subcommand)]
    pub cmd: Option<Command>,

    /// Unix socket path for desktop IPC.
    #[arg(
        long,
        env = "SOMA_DAEMON_SOCKET",
        default_value = "/tmp/soma-daemon.sock"
    )]
    pub socket_path: PathBuf,

    /// Blob storage directory used by the daemon.
    #[arg(long, env = "SOMA_BLOB_DIR", default_value = "./blobs")]
    pub blob_dir: PathBuf,

    /// Path to the daemon SQLite database.
    #[arg(long, env = "SOMA_DAEMON_DB", default_value = "./daemon.db")]
    pub db_path: PathBuf,

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

/// Default libp2p listen multiaddrs used by both the binary CLI defaults and
/// the embeddable [`crate::RuntimeConfig::default`] impl.
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
