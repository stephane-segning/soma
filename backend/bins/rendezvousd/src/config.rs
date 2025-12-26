use std::net::SocketAddr;

use clap::{Parser, Subcommand};

#[derive(Debug, Parser)]
#[command(name = "soma-rendezvousd", version)]
pub struct Args {
    #[command(subcommand)]
    pub cmd: Option<Command>,

    #[arg(long, env = "HTTP_ADDR", default_value = "0.0.0.0:8082")]
    pub http_addr: SocketAddr,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Generate the rendezvous identity and exit.
    GenerateIdentity {
        /// Optional path override for the identity file.
        #[arg(long)]
        path: Option<std::path::PathBuf>,
    },
}
