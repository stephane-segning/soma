use std::path::PathBuf;

use clap::Parser;

/// CLI arguments for the `soma-agentd` binary.
///
/// Only used by the binary shim; embedders should build a
/// [`crate::RuntimeConfig`] directly.
#[derive(Debug, Parser)]
#[command(name = "soma-agentd", version)]
pub struct Args {
    /// Unix socket path for desktop IPC.
    #[arg(
        long,
        env = "SOMA_AGENTD_SOCKET",
        default_value = "/tmp/soma-agentd.sock"
    )]
    pub socket_path: PathBuf,

    /// SQLite path for persisted background tasks.
    #[arg(long, env = "SOMA_AGENTD_DB_PATH", default_value = "./agentd.db")]
    pub db_path: PathBuf,
}
