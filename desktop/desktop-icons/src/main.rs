use anyhow::Result;
use clap::Parser;

mod cli;
mod icns;
mod ico;
mod paths;
mod png;

fn main() -> Result<()> {
    cli::run(cli::Cli::parse())
}
