use clap::Parser;
use soma_core::SomaResult;
use soma_proto_build::agent;
use tracing::info;

use crate::config::{AgentdConfig, Args};
use crate::engine::EngineHandle;
use crate::grpc::AgentdService;
use crate::tasks::BackgroundTaskStore;
use soma_socket::{GrpcUnixServer, GrpcUnixService};
use tonic::transport::{Server, server::Router as TonicRouter};

pub async fn run_from_cli() -> SomaResult<()> {
    let args = Args::parse();
    let config = AgentdConfig::from_args(&args);

    let engine = EngineHandle::spawn(config.clone());
    let task_store = BackgroundTaskStore::connect(&config.db_path)
        .await
        .map_err(|err| soma_core::Error::Anyhow(err.into()))?;

    info!(
        socket = %config.socket_path.display(),
        db_path = %config.db_path.display(),
        "soma-agentd starting"
    );

    let svc = agent::agent_server::AgentServer::new(AgentdService::new(engine, task_store));
    let service = AgentdGrpcService {
        socket_path: config.socket_path,
        svc,
    };
    GrpcUnixServer::new(service).run().await
}

struct AgentdGrpcService {
    socket_path: std::path::PathBuf,
    svc: agent::agent_server::AgentServer<AgentdService>,
}

impl GrpcUnixService for AgentdGrpcService {
    fn socket_path(&self) -> &std::path::Path {
        &self.socket_path
    }

    fn configure(self, mut server: Server) -> TonicRouter {
        server.add_service(self.svc)
    }
}
