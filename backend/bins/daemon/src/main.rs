use mimalloc::MiMalloc;
use soma_core::SomaResult;

mod config;
mod dispatch;
mod grpc;
mod handlers;
mod runtime;
mod services;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[tokio::main]
async fn main() -> SomaResult<()> {
    soma_core::telemetry::init_tracing("info");
    runtime::run_from_cli().await
}
