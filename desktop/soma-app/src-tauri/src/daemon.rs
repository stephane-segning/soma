use std::{path::PathBuf, sync::Arc};

use anyhow::Context;
use derive_builder::Builder;
use soma_proto_build::daemon::{
    CreateSpaceRequest, CreateSpaceResponse, DeleteSpaceRequest, DeleteSpaceResponse,
    EnsurePageRequest, EnsurePageResponse, GetDocumentRequest, GetDocumentResponse,
    GetSpaceRequest, GetSpaceResponse, ListPagesRequest, ListPagesResponse,
    ListSpaceMembersRequest, ListSpaceMembersResponse, ListSpacesRequest, ListSpacesResponse,
    PageRecord, ReadBlobRequest, ReadBlobResponse, SetPageParentsRequest, UpdatePageTitleRequest,
    UpdateSpaceRequest, UpdateSpaceResponse,
    UploadBlobRequest, UploadBlobResponse, UpsertDocumentRequest, UpsertDocumentResponse,
    daemon_client::DaemonClient as GrpcDaemonClient,
};
use tauri::async_runtime;
use tokio::sync::Mutex;
use tonic::{
    Code,
    transport::{Channel, Endpoint},
};
use tracing::info;

use crate::error::AppResult;
use crate::{error::AppError, transport::unix_connector};

pub trait BlobSource: Send + Sync {
    fn read_blob(&self, space_id: &str, cid: &str) -> AppResult<Option<Vec<u8>>>;
}

#[derive(Builder, Debug, Clone)]
#[builder(pattern = "owned", build_fn(error = "anyhow::Error"))]
pub struct DaemonConfig {
    #[builder(setter(into))]
    socket_path: PathBuf,
}

impl DaemonConfig {
    pub fn from_env() -> anyhow::Result<Self> {
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
    pub fn from_env() -> anyhow::Result<Arc<Self>> {
        let config = DaemonConfig::from_env()?;
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

    pub async fn read_blob_rpc(
        &self,
        req: ReadBlobRequest,
    ) -> Result<Option<ReadBlobResponse>, AppError> {
        let mut client = self.client().await?;
        match client.read_blob(req).await {
            Ok(res) => Ok(Some(res.into_inner())),
            Err(status) if status.code() == Code::NotFound => Ok(None),
            Err(err) => Err(err.into()),
        }
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

    pub async fn list_space_members(
        &self,
        req: ListSpaceMembersRequest,
    ) -> Result<ListSpaceMembersResponse, AppError> {
        let mut client = self.client().await?;
        let res = client.list_space_members(req).await?;
        Ok(res.into_inner())
    }

    pub async fn get_document(
        &self,
        req: GetDocumentRequest,
    ) -> Result<Option<GetDocumentResponse>, AppError> {
        let mut client = self.client().await?;
        match client.get_document(req).await {
            Ok(res) => Ok(Some(res.into_inner())),
            Err(status) if status.code() == Code::NotFound => Ok(None),
            Err(err) => Err(err.into()),
        }
    }

    pub async fn ensure_page(&self, req: EnsurePageRequest) -> Result<PageRecord, AppError> {
        let mut client = self.client().await?;
        let res: EnsurePageResponse = client.ensure_page(req).await?.into_inner();
        res.page
            .ok_or_else(|| AppError::Daemon("daemon returned empty page".to_string()))
    }

    pub async fn list_pages(&self, req: ListPagesRequest) -> Result<Vec<PageRecord>, AppError> {
        let mut client = self.client().await?;
        let res: ListPagesResponse = client.list_pages(req).await?.into_inner();
        Ok(res.pages)
    }

    pub async fn update_page_title(
        &self,
        req: UpdatePageTitleRequest,
    ) -> Result<Option<PageRecord>, AppError> {
        let mut client = self.client().await?;
        match client.update_page_title(req).await {
            Ok(res) => Ok(res.into_inner().page),
            Err(status) if status.code() == Code::NotFound => Ok(None),
            Err(err) => Err(err.into()),
        }
    }

    pub async fn set_page_parents(
        &self,
        req: SetPageParentsRequest,
    ) -> Result<Option<PageRecord>, AppError> {
        let mut client = self.client().await?;
        match client.set_page_parents(req).await {
            Ok(res) => Ok(res.into_inner().page),
            Err(status) if status.code() == Code::NotFound => Ok(None),
            Err(err) => Err(err.into()),
        }
    }
}

impl BlobSource for DaemonApi {
    fn read_blob(&self, space_id: &str, cid: &str) -> AppResult<Option<Vec<u8>>> {
        let req = ReadBlobRequest {
            space_id: space_id.to_string(),
            cid: cid.to_string(),
        };
        let res = async_runtime::block_on(async { self.read_blob_rpc(req).await })?;
        Ok(res.map(|r| r.data))
    }
}
