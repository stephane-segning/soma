use std::{path::PathBuf, sync::Arc};

use anyhow::{Context, Result};
use hyper_util::rt::tokio::TokioIo;
use soma_proto_build::agent::{ChatRequest, ChatResponse, agent_client::AgentClient};
use tauri::AppHandle;
use tokio::net::UnixStream;
use tokio::sync::Mutex;
use tonic::transport::{Channel, Endpoint, Uri};
use tower::util::service_fn;
use tracing::info;

pub struct AgentApi {
    socket_path: PathBuf,
    client: Mutex<Option<AgentClient<Channel>>>,
}

impl AgentApi {
    pub fn from_app(_app: &AppHandle) -> Result<Arc<Self>> {
        let socket_path = std::env::var_os("SOMA_AGENTD_SOCKET")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("/tmp/soma-agentd.sock"));
        info!("Using soma-agentd socket at {:?}", socket_path);
        Ok(Arc::new(Self {
            socket_path,
            client: Mutex::new(None),
        }))
    }

    async fn client(&self) -> Result<AgentClient<Channel>> {
        let mut guard: tokio::sync::MutexGuard<'_, Option<AgentClient<Channel>>> =
            self.client.lock().await;
        if let Some(client) = guard.clone() {
            return Ok(client);
        }

        let path = self.socket_path.clone();
        let endpoint = Endpoint::try_from("http://[::]:50051")?;
        let channel = endpoint
            .connect_with_connector(service_fn(move |_: Uri| {
                let path = path.clone();
                async move { UnixStream::connect(path).await.map(TokioIo::new) }
            }))
            .await
            .context("failed to connect to soma-agentd socket")?;

        let client = AgentClient::new(channel);
        *guard = Some(client.clone());
        Ok(client)
    }

    pub async fn chat(&self, req: ChatRequest) -> Result<ChatResponse> {
        let mut client = self.client().await?;
        let res = client.chat(req).await?;
        Ok(res.into_inner())
    }

    pub async fn chat_stream(
        &self,
        req: ChatRequest,
    ) -> Result<tonic::Streaming<soma_proto_build::agent::ChatStreamEvent>> {
        let mut client = self.client().await?;
        let res = client.chat_stream(req).await?;
        Ok(res.into_inner())
    }
}
