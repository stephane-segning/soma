use std::{path::PathBuf, sync::Arc};

use derive_builder::Builder;
use soma_proto_build::daemon::{
    UploadBlobRequest, UploadBlobResponse, daemon_client::DaemonClient as GrpcDaemonClient,
};
use tauri::{AppHandle, Wry};
use tokio::sync::Mutex;
use tonic::transport::{Channel, Endpoint};
use tracing::info;

use crate::error::{AppError, AppResult};
use crate::transport::unix_connector;

#[derive(Builder, Debug, Clone)]
#[builder(pattern = "owned", build_fn(error = "anyhow::Error"))]
pub struct DaemonConfig {
    #[builder(setter(into))]
    socket_path: PathBuf,
}

impl DaemonConfig {
    pub fn from_app() -> anyhow::Result<Self> {
        let socket_path = std::env::var_os("SOMA_DAEMON_SOCKET")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("/tmp/soma-daemon.sock"));

        Ok(DaemonConfigBuilder::default()
            .socket_path(socket_path)
            .build()?)
    }
}

#[derive(Debug)]
pub struct DaemonApi {
    config: DaemonConfig,
    client: Mutex<Option<GrpcDaemonClient<Channel>>>,
}

impl DaemonApi {
    pub fn from_app(_app: &AppHandle<Wry>) -> anyhow::Result<Arc<Self>> {
        let config = DaemonConfig::from_app()?;
        info!("Using soma-daemon socket at {:?}", config.socket_path);

        Ok(Arc::new(Self {
            config,
            client: Mutex::new(None),
        }))
    }

    async fn client(&self) -> Result<GrpcDaemonClient<Channel>, AppError> {
        let mut guard: tokio::sync::MutexGuard<'_, Option<GrpcDaemonClient<Channel>>> =
            self.client.lock().await;
        if let Some(client) = guard.clone() {
            return Ok(client);
        }

        // Dummy endpoint is required by tonic; actual connection is via the Unix connector.
        let endpoint =
            Endpoint::try_from("http://[::]:0").map_err(tonic::transport::Error::from)?;
        let channel = endpoint
            .connect_with_connector(unix_connector(self.config.socket_path.clone()))
            .await?;

        let client = GrpcDaemonClient::new(channel);
        *guard = Some(client.clone());
        Ok(client)
    }

    pub async fn upload_blob(&self, req: UploadBlobRequest) -> AppResult<UploadBlobResponse> {
        let mut client = self.client().await?;
        let res = client.upload_blob(req).await?;
        Ok(res.into_inner())
    }
}
