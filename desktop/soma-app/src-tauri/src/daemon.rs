use std::{fs, path::PathBuf, sync::Arc};

use anyhow::Context;
use derive_builder::Builder;
use soma_proto_build::daemon::{
    CreateSpaceRequest, CreateSpaceResponse, DeleteSpaceRequest, DeleteSpaceResponse,
    GetSpaceRequest, GetSpaceResponse, ListSpacesRequest, ListSpacesResponse,
    UpdateSpaceRequest, UpdateSpaceResponse, UploadBlobRequest, UploadBlobResponse,
    UpsertDocumentRequest, UpsertDocumentResponse, daemon_client::DaemonClient as GrpcDaemonClient,
};
use tauri::{AppHandle, Wry};
use tokio::sync::Mutex;
use tonic::transport::{Channel, Endpoint};
use tracing::info;

use crate::{error::AppError, transport::unix_connector};

pub trait BlobSource: Send + Sync {
    fn read_blob(&self, space_id: &str, cid: &str) -> Result<Option<Vec<u8>>, AppError>;
}

#[derive(Builder, Debug, Clone)]
#[builder(pattern = "owned", build_fn(error = "anyhow::Error"))]
pub struct DaemonConfig {
    #[builder(setter(into))]
    socket_path: PathBuf,
    #[builder(setter(into))]
    blob_dir: PathBuf,
}

impl DaemonConfig {
    pub fn from_app() -> anyhow::Result<Self> {
        let socket_path = std::env::var_os("SOMA_DAEMON_SOCKET")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("/tmp/soma-daemon.sock"));

        let blob_dir = std::env::var_os("SOMA_BLOB_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("blobs"));

        Ok(DaemonConfigBuilder::default()
            .socket_path(socket_path)
            .blob_dir(blob_dir)
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
        info!("Assuming daemon blob directory at {:?}", config.blob_dir);
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
        let endpoint = Endpoint::try_from("http://[::]:0")?;
        let channel = endpoint
            .connect_with_connector(unix_connector(self.config.socket_path.clone()))
            .await
            .context("failed to connect to soma-daemon socket")?;

        let client = GrpcDaemonClient::new(channel);
        *guard = Some(client.clone());
        Ok(client)
    }

    pub async fn upsert_document(
        &self,
        req: UpsertDocumentRequest,
    ) -> Result<UpsertDocumentResponse, AppError> {
        let mut client = self.client().await?;
        let res = client.upsert_document(req).await?;
        Ok(res.into_inner())
    }

    pub async fn upload_blob(
        &self,
        req: UploadBlobRequest,
    ) -> Result<UploadBlobResponse, AppError> {
        let mut client = self.client().await?;
        let res = client.upload_blob(req).await?;
        Ok(res.into_inner())
    }

    pub async fn list_spaces(
        &self,
        req: ListSpacesRequest,
    ) -> Result<ListSpacesResponse, AppError> {
        let mut client = self.client().await?;
        let res = client.list_spaces(req).await?;
        Ok(res.into_inner())
    }

    pub async fn create_space(
        &self,
        req: CreateSpaceRequest,
    ) -> Result<CreateSpaceResponse, AppError> {
        let mut client = self.client().await?;
        let res = client.create_space(req).await?;
        Ok(res.into_inner())
    }

    pub async fn get_space(&self, req: GetSpaceRequest) -> Result<GetSpaceResponse, AppError> {
        let mut client = self.client().await?;
        let res = client.get_space(req).await?;
        Ok(res.into_inner())
    }

    pub async fn update_space(
        &self,
        req: UpdateSpaceRequest,
    ) -> Result<UpdateSpaceResponse, AppError> {
        let mut client = self.client().await?;
        let res = client.update_space(req).await?;
        Ok(res.into_inner())
    }

    pub async fn delete_space(
        &self,
        req: DeleteSpaceRequest,
    ) -> Result<DeleteSpaceResponse, AppError> {
        let mut client = self.client().await?;
        let res = client.delete_space(req).await?;
        Ok(res.into_inner())
    }
}

impl BlobSource for DaemonApi {
    fn read_blob(&self, space_id: &str, cid: &str) -> Result<Option<Vec<u8>>, AppError> {
        let path = self.config.blob_dir.join(space_id).join(cid);
        if !path.exists() {
            return Ok(None);
        }
        Ok(Some(fs::read(path)?))
    }
}
