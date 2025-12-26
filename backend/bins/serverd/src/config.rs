use std::net::SocketAddr;

use clap::{Parser, Subcommand};

#[derive(Debug, Parser)]
#[command(name = "soma-serverd", version)]
pub struct Args {
    #[command(subcommand)]
    pub cmd: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    Relay(RelayArgs),
    Rendezvous(RendezvousArgs),
    Bff(BffArgs),
}

#[derive(Debug, Parser)]
pub struct RelayArgs {
    #[arg(long, env = "HTTP_ADDR", default_value = "0.0.0.0:8081")]
    pub http_addr: SocketAddr,
}

#[derive(Debug, Parser)]
pub struct RendezvousArgs {
    #[arg(long, env = "HTTP_ADDR", default_value = "0.0.0.0:8082")]
    pub http_addr: SocketAddr,
}

#[derive(Debug, Parser)]
pub struct BffArgs {
    #[arg(long, env = "HTTP_ADDR", default_value = "0.0.0.0:8083")]
    pub http_addr: SocketAddr,
}
