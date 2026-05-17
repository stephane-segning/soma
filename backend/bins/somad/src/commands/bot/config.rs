use clap::{Subcommand, ValueEnum};
use libp2p::Multiaddr;
use soma_net::IdentityManager;
use std::{net::SocketAddr, path::PathBuf};

/// CLI args for `somad bot`.
#[derive(Debug, clap::Args)]
pub struct Args {
    #[command(subcommand)]
    pub cmd: Option<Command>,

    #[arg(long, env = "HTTP_ADDR", default_value = "0.0.0.0:8080")]
    pub http_addr: SocketAddr,

    #[arg(long, env = "SOMA_BLOB_DIR", default_value = "./blobs")]
    pub blob_dir: PathBuf,

    /// Database URL (postgres://... or sqlite file path/url). Defaults to ./botd.db (SQLite).
    #[arg(long, env = "SOMA_DATABASE_URL")]
    pub db_url: Option<String>,

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

    /// Operating mode: bot (read-only HTTP) or admin (admin control plane).
    #[arg(long, env = "SOMA_MODE", default_value = "bot", value_enum)]
    pub mode: Mode,

    /// Optional bearer token required for admin APIs (admin mode).
    #[arg(long, env = "SOMA_ADMIN_TOKEN")]
    pub admin_token: Option<String>,
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
    pub db_url: String,
    pub http_addr: SocketAddr,
    pub listen_addrs: Vec<Multiaddr>,
    pub bootstrap_addrs: Vec<Multiaddr>,
    pub rendezvous_addrs: Vec<Multiaddr>,
    pub relay_addrs: Vec<Multiaddr>,
    pub enable_mdns: bool,
    pub mode: Mode,
    pub admin_token: Option<String>,
}

impl BotConfig {
    pub fn from_args(args: &Args) -> Self {
        let idm = IdentityManager::from_env();
        Self {
            identity_path: idm.default_identity_path("bot"),
            blob_dir: args.blob_dir.clone(),
            db_url: args
                .db_url
                .as_deref()
                .map(|s| s.to_string())
                .unwrap_or_else(|| "./botd.db".into()),
            http_addr: args.http_addr,
            listen_addrs: args.listen_addrs.clone(),
            bootstrap_addrs: args.bootstrap_addrs.clone(),
            rendezvous_addrs: args.rendezvous_addrs.clone(),
            relay_addrs: args.relay_addrs.clone(),
            enable_mdns: !args.disable_mdns,
            mode: args.mode,
            admin_token: args.admin_token.clone(),
        }
    }
}

impl From<&Args> for BotConfig {
    fn from(args: &Args) -> Self {
        BotConfig::from_args(args)
    }
}

#[derive(Clone, Copy, Debug, ValueEnum, PartialEq, Eq)]
#[value(rename_all = "kebab-case")]
pub enum Mode {
    Bot,
    Admin,
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
