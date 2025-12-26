use mimalloc::MiMalloc;

mod config;
mod runtime;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    soma_core::telemetry::init_tracing("info");
    runtime::run_from_cli().await
}
