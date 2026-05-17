//! `soma-daemon` binary: a thin shim around the embeddable `soma_daemon`
//! library. Parses CLI args with clap, installs the global allocator, tracing
//! subscriber and Ctrl-C handler, and delegates everything else to `lib.rs`.

use clap::Parser;
use mimalloc::MiMalloc;
use soma_core::SomaResult;
use soma_daemon::__bin::{Args, Command};
use soma_daemon::{RuntimeConfig, run};
use soma_net::IdentityManager;
use tokio::signal;
use tracing::info;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[tokio::main]
async fn main() -> SomaResult<()> {
    soma_core::telemetry::init_tracing("info");

    let args = Args::parse();
    let idm = IdentityManager::from_env();

    if let Some(Command::GenerateIdentity { path }) = args.cmd {
        let path = path.unwrap_or_else(|| idm.default_identity_path("daemon"));
        let id = idm.generate(&path)?;
        info!(
            "generated daemon identity at {:?}, peer_id={}",
            path,
            id.peer_id()
        );
        return Ok(());
    }

    let config = RuntimeConfig {
        socket_path: Some(args.socket_path),
        blob_dir: args.blob_dir,
        db_path: args.db_path,
        identity_path: idm.default_identity_path("daemon"),
        listen_addrs: args.listen_addrs,
        bootstrap_addrs: args.bootstrap_addrs,
        rendezvous_addrs: args.rendezvous_addrs,
        relay_addrs: args.relay_addrs,
        enable_mdns: !args.disable_mdns,
    };

    let handle = run(config).await?;

    // Wait for SIGINT, then drive a graceful shutdown — matches the previous
    // single-loop behaviour of the binary. (If the supervisor exits on its
    // own first, `shutdown()` will simply await the already-finished task.)
    let _ = signal::ctrl_c().await;
    handle.shutdown().await
}
