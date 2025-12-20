use mimalloc::MiMalloc;
use soma_core::SomaResult;
use tracing_subscriber::EnvFilter;

mod blob_cache;
mod config;
mod event_handlers;
mod http;
mod metrics;
mod runtime;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[tokio::main]
async fn main() -> SomaResult<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    runtime::run_from_cli().await
}
