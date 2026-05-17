//! `somad` — Soma's unified server binary.
//!
//! All non-desktop server roles are exposed as subcommands. One binary, one
//! Docker image, one signed artifact. Mode is purely a runtime choice; the
//! underlying shared crates are the same as the napi-rs `.node` addon that
//! Electron loads on the desktop side.

use clap::Parser;
use mimalloc::MiMalloc;

mod commands;

use commands::Cli;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    soma_core::telemetry::init_tracing("info");
    let cli = Cli::parse();
    commands::dispatch(cli).await
}
