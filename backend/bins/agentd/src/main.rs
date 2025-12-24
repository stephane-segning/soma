use clap::Parser;
use mimalloc::MiMalloc;
use soma_core::SomaResult;
use soma_proto_build::agent;
use tracing::info;
use tracing_subscriber::EnvFilter;

mod config;
mod engine;
mod grpc;

use config::{AgentdConfig, Args};
use engine::EngineHandle;
use grpc::{AgentdService, serve_grpc};

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[tokio::main]
async fn main() -> SomaResult<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let args = Args::parse();
    let config = AgentdConfig::from_args(&args);

    let engine =
        EngineHandle::spawn(config.clone()).map_err(|err| soma_core::Error::Anyhow(err.into()))?;

    info!(
        socket = %config.socket_path.display(),
        models_dir = %config.models_dir.display(),
        default_chat_model = %config.default_chat_model,
        default_embed_model = %config.default_embed_model,
        "soma-agentd starting"
    );

    let svc = agent::agent_server::AgentServer::new(AgentdService::new(engine));
    serve_grpc(config.socket_path, svc).await
}
