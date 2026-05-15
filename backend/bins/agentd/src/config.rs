use std::path::PathBuf;

use clap::Parser;

/// CLI arguments for the desktop agent (local helper RPCs).
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

#[derive(Debug, Clone)]
pub struct AgentdConfig {
    pub socket_path: PathBuf,
    pub db_path: PathBuf,
}

impl AgentdConfig {
    pub fn from_args(args: &Args) -> Self {
        Self {
            socket_path: args.socket_path.clone(),
            db_path: args.db_path.clone(),
        }
    }
}
