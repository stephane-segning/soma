//! `BlobReader` impl backed by `soma_daemon::DaemonHandle`. The Tauri builder
//! in `desktop-app` registers the `soma-blob://` scheme with a closure that
//! delegates to this reader.

use std::sync::Arc;

use async_trait::async_trait;
use desktop_core::error::{DesktopError, DesktopResult};
use desktop_services::blob_protocol::{BlobReader, ReadBlob, SharedBlobReader};

use crate::runtime::DaemonRuntime;

pub struct DaemonBlobReader {
    runtime: Arc<DaemonRuntime>,
}

impl DaemonBlobReader {
    pub fn new(runtime: Arc<DaemonRuntime>) -> Self {
        Self { runtime }
    }

    pub fn shared(runtime: Arc<DaemonRuntime>) -> SharedBlobReader {
        Arc::new(Self::new(runtime))
    }
}

#[async_trait]
impl BlobReader for DaemonBlobReader {
    async fn read_blob(&self, space_id: &str, cid: &str) -> DesktopResult<ReadBlob> {
        let handle = self.runtime.handle().await?;
        let res = handle
            .read_blob(space_id, cid)
            .await
            .map_err(|e| DesktopError::Daemon { message: e.to_string() })?;
        let Some(res) = res else {
            return Err(DesktopError::NotFound {
                message: format!("blob {space_id}/{cid}"),
            });
        };
        Ok(ReadBlob {
            data: res.data,
            mime: res.mime,
        })
    }
}
