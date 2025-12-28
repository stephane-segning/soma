use serde::{Deserialize, Serialize};
use soma_proto_build::daemon::UploadBlobRequest;

use crate::error::AppResult;
use crate::state::ManagedState;

#[derive(Clone)]
pub struct BlobsController {
    state: ManagedState,
}

impl BlobsController {
    pub fn new(state: ManagedState) -> Self {
        Self { state }
    }

    pub async fn stage(&self, params: BlobStageParams) -> AppResult<BlobStageResult> {
        let space_id = params.space_id.clone();
        let payload = UploadBlobRequest {
            space_id: params.space_id,
            data: params.bytes,
            mime: params.mime,
            name: params.file_name.unwrap_or_else(|| "blob".to_string()),
            doc_id: params.doc_id.unwrap_or_default(),
        };
        let res = self.state.daemon.upload_blob(payload).await?;

        Ok(BlobStageResult {
            cid: res.cid.clone(),
            size: res.size,
            mime: res.mime.clone(),
            name: res.name.clone(),
            url: format!("soma-blob://daemon/{}/{}", space_id, res.cid),
        })
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlobStageParams {
    pub space_id: String,
    pub doc_id: Option<String>,
    pub bytes: Vec<u8>,
    pub mime: String,
    pub file_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlobStageResult {
    pub cid: String,
    pub size: u64,
    pub mime: String,
    pub name: String,
    pub url: String,
}
