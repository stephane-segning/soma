//! Subcommand dispatch for `somad`.
//!
//! Each subcommand lives in its own module under `commands/` with a `pub struct Args`
//! (clap-derived) and a `pub async fn run(args: Args) -> anyhow::Result<()>` entry
//! point. Adding a new mode = adding a new module here and a variant on [`Command`].

use clap::{Parser, Subcommand};

pub mod all;
pub mod bff;
pub mod bot;
pub mod relay;
pub mod rendezvous;

/// `somad <SUBCOMMAND> [OPTIONS]`.
#[derive(Debug, Parser)]
#[command(
    name = "somad",
    version,
    about = "Soma server: one binary, multiple modes (bot, relay, rendezvous, bff, all)"
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Run a headless peer (`bot` or `admin` mode).
    Bot(bot::Args),
    /// Run a libp2p circuit relay v2 service.
    Relay(relay::Args),
    /// Run a libp2p rendezvous discovery service.
    Rendezvous(rendezvous::Args),
    /// Run the LLM backend-for-frontend service.
    Bff(bff::Args),
    /// Compose multiple modes in one process via `--config`.
    All(all::Args),
}

pub async fn dispatch(cli: Cli) -> anyhow::Result<()> {
    match cli.command {
        Command::Bot(args) => bot::run(args).await,
        Command::Relay(args) => relay::run(args).await,
        Command::Rendezvous(args) => rendezvous::run(args).await,
        Command::Bff(args) => bff::run(args).await,
        Command::All(args) => all::run(args).await,
    }
}
