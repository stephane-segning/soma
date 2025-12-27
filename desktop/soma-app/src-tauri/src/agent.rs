use std::{path::PathBuf, sync::Arc};

use anyhow::Context;
use derive_builder::Builder;
use soma_proto_build::agent::{ChatRequest, ChatResponse, agent_client::AgentClient};
use tauri::AppHandle;
use tokio::sync::Mutex;
use tonic::transport::{Channel, Endpoint};
use tracing::info;

use crate::{error::AppError, transport::unix_connector};

#[derive(Builder, Debug, Clone)]
#[builder(pattern = "owned", build_fn(error = "anyhow::Error"))]
pub struct AgentConfig {
    #[builder(setter(into))]
    socket_path: PathBuf,
}

impl AgentConfig {
    pub fn from_env() -> anyhow::Result<Self> {
        let socket_path = std::env::var_os("SOMA_AGENTD_SOCKET")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("/tmp/soma-agentd.sock"));
        
        Ok(AgentConfigBuilder::default()
            .socket_path(socket_path)
            .build()?)
    }
}

pub struct AgentApi {
    config: AgentConfig,
    client: Mutex<Option<AgentClient<Channel>>>,
}

impl AgentApi {
    pub fn from_app(_app: &AppHandle) -> anyhow::Result<Arc<Self>> {
        let config = AgentConfig::from_env()?;
        info!("Using soma-agentd socket at {:?}", config.socket_path);
        Ok(Arc::new(Self {
            config,
            client: Mutex::new(None),
        }))
    }

    async fn client(&self) -> Result<AgentClient<Channel>, AppError> {
        let mut guard: tokio::sync::MutexGuard<'_, Option<AgentClient<Channel>>> =
            self.client.lock().await;
        if let Some(client) = guard.clone() {
            return Ok(client);
        }

        // Dummy endpoint is required by tonic; actual connection is via the Unix connector.
        let endpoint = Endpoint::try_from("http://[::]:0")?;
        let channel = endpoint
            .connect_with_connector(unix_connector(self.config.socket_path.clone()))
            .await
            .context("failed to connect to soma-agentd socket")?;

        let client = AgentClient::new(channel);
        *guard = Some(client.clone());
        Ok(client)
    }

    pub async fn chat(&self, req: ChatRequest) -> Result<ChatResponse, AppError> {
        let mut client = self.client().await?;
        let res = client.chat(req).await?;
        Ok(res.into_inner())
    }

    pub async fn chat_stream(
        &self,
        req: ChatRequest,
    ) -> Result<tonic::Streaming<soma_proto_build::agent::ChatStreamEvent>, AppError> {
        let mut client = self.client().await?;
        let res = client.chat_stream(req).await?;
        Ok(res.into_inner())
    }
}
