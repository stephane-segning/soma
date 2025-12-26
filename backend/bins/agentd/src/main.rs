use mimalloc::MiMalloc;
use soma_core::SomaResult;

mod config;
mod engine;
mod grpc;
mod runtime;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[tokio::main]
async fn main() -> SomaResult<()> {
    soma_core::telemetry::init_tracing("info");
    runtime::run_from_cli().await
}
