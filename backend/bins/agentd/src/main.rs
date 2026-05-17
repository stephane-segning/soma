//! `soma-agentd` binary: thin clap shim around the embeddable `soma_agentd`
//! library. Installs the global allocator, tracing subscriber and Ctrl-C
//! handler; delegates the rest to `lib.rs`.

use clap::Parser;
use mimalloc::MiMalloc;
use soma_agentd::__bin::Args;
use soma_agentd::{RuntimeConfig, run};
use soma_core::SomaResult;
use tokio::signal;
use tracing::info;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[tokio::main]
async fn main() -> SomaResult<()> {
    soma_core::telemetry::init_tracing("info");

    let args = Args::parse();
    let config = RuntimeConfig {
        socket_path: Some(args.socket_path),
        db_path: args.db_path,
    };

    let mut handle = run(config).await?;

    // Race SIGINT against the supervisor so the binary exits when the
    // runtime fails on its own (and not only when an operator sends SIGINT).
    tokio::select! {
        _ = signal::ctrl_c() => {
            info!("SIGINT received, shutting down agentd");
        }
        res = handle.wait() => {
            return res;
        }
    }

    handle.shutdown().await
}
