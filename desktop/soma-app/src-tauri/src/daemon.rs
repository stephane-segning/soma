use std::{fs, path::PathBuf, sync::Arc};

use anyhow::{Context, Result};
use hyper_util::rt::tokio::TokioIo;
use soma_proto_build::daemon::{
    UploadBlobRequest, UploadBlobResponse, UpsertDocumentRequest, UpsertDocumentResponse,
    daemon_client::DaemonClient as GrpcDaemonClient,
};
use tauri::{AppHandle, Manager, Wry};
use tokio::net::UnixStream;
use tokio::sync::Mutex;
use tonic::transport::{Channel, Endpoint, Uri};
use tower::util::service_fn;
use tracing::info;

pub struct DaemonApi {
    socket_path: PathBuf,
    blob_dir: PathBuf,
    client: Mutex<Option<GrpcDaemonClient<Channel>>>,
}

impl DaemonApi {
    pub fn from_app(app: &AppHandle<Wry>) -> Result<Arc<Self>> {
        let socket_path = std::env::var_os("SOMA_DAEMON_SOCKET")
            .map(PathBuf::from)
            .or_else(|| {
                app.path()
                    .app_data_dir()
                    .ok()
                    .map(|p| p.join("soma-daemon.sock"))
            })
            .unwrap_or_else(|| PathBuf::from("soma-daemon.sock"));
        let blob_dir = std::env::var_os("SOMA_BLOB_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("blobs"));
        info!("Using soma-daemon socket at {:?}", socket_path);
        info!("Assuming daemon blob directory at {:?}", blob_dir);
        Ok(Arc::new(Self {
            socket_path,
            blob_dir,
            client: Mutex::new(None),
        }))
    }

    async fn client(&self) -> Result<GrpcDaemonClient<Channel>> {
        let mut guard: tokio::sync::MutexGuard<'_, Option<GrpcDaemonClient<Channel>>> =
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
            .context("failed to connect to soma-daemon socket")?;

        let client = GrpcDaemonClient::new(channel);
        *guard = Some(client.clone());
        Ok(client)
    }

    pub async fn upsert_document(
        &self,
        req: UpsertDocumentRequest,
    ) -> Result<UpsertDocumentResponse> {
        let mut client = self.client().await?;
        let res = client.upsert_document(req).await?;
        Ok(res.into_inner())
    }

    pub async fn upload_blob(&self, req: UploadBlobRequest) -> Result<UploadBlobResponse> {
        let mut client = self.client().await?;
        let res = client.upload_blob(req).await?;
        Ok(res.into_inner())
    }

    pub fn read_blob(&self, space_id: &str, cid: &str) -> Result<Option<Vec<u8>>> {
        let path = self.blob_dir.join(space_id).join(cid);
        if !path.exists() {
            return Ok(None);
        }
        Ok(Some(fs::read(path)?))
    }
}
