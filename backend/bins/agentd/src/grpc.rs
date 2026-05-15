use std::{pin::Pin, sync::Arc};

use futures::Stream;
use soma_proto_build::agent;
use tonic::{Request, Response, Status};
use yrs::{Doc, ReadTxn, StateVector, Transact, Update, updates::decoder::Decode};

use crate::engine::{EngineHandle, EngineStatus};
use crate::tasks::{
    BackgroundTaskKind as StoreBackgroundTaskKind, BackgroundTaskRecord,
    BackgroundTaskStatus as StoreBackgroundTaskStatus, BackgroundTaskStore,
};

#[derive(Debug)]
pub struct AgentdState {
    pub engine: EngineHandle,
    pub task_store: BackgroundTaskStore,
}

#[derive(Clone)]
pub struct AgentdService {
    pub state: Arc<AgentdState>,
}

impl AgentdService {
    pub fn new(engine: EngineHandle, task_store: BackgroundTaskStore) -> Self {
        Self {
            state: Arc::new(AgentdState { engine, task_store }),
        }
    }

    async fn status_inner(&self) -> Result<EngineStatus, Status> {
        Ok(self.state.engine.status())
    }
}

#[tonic::async_trait]
impl agent::agent_server::Agent for AgentdService {
    async fn status(
        &self,
        _request: Request<()>,
    ) -> Result<Response<agent::StatusResponse>, Status> {
        let status = self.status_inner().await?;
        let models = status.models.into_iter().map(map_model_info).collect();

        Ok(Response::new(agent::StatusResponse {
            version: status.version,
            default_chat_model: status.default_chat_model,
            default_embed_model: status.default_embed_model,
            models,
        }))
    }

    async fn list_models(
        &self,
        _request: Request<()>,
    ) -> Result<Response<agent::ListModelsResponse>, Status> {
        let status = self.status_inner().await?;
        let models = status.models.into_iter().map(map_model_info).collect();
        Ok(Response::new(agent::ListModelsResponse { models }))
    }

    async fn inline_complete(
        &self,
        request: Request<agent::InlineCompleteRequest>,
    ) -> Result<Response<agent::InlineCompleteResponse>, Status> {
        let _ = request;
        Err(model_rpcs_disabled())
    }

    async fn chat(
        &self,
        request: Request<agent::ChatRequest>,
    ) -> Result<Response<agent::ChatResponse>, Status> {
        let _ = request;
        Err(model_rpcs_disabled())
    }

    type ChatStreamStream =
        Pin<Box<dyn Stream<Item = Result<agent::ChatStreamEvent, Status>> + Send + 'static>>;

    async fn chat_stream(
        &self,
        request: Request<agent::ChatRequest>,
    ) -> Result<Response<Self::ChatStreamStream>, Status> {
        let _ = request;
        Err(model_rpcs_disabled())
    }

    async fn embed(
        &self,
        request: Request<agent::EmbedRequest>,
    ) -> Result<Response<agent::EmbedResponse>, Status> {
        let _ = request;
        Err(model_rpcs_disabled())
    }

    async fn rerank(
        &self,
        request: Request<agent::RerankRequest>,
    ) -> Result<Response<agent::RerankResponse>, Status> {
        let _ = request;
        Err(model_rpcs_disabled())
    }

    async fn resolve_drift(
        &self,
        request: Request<agent::ResolveDriftRequest>,
    ) -> Result<Response<agent::ResolveDriftResponse>, Status> {
        let payload = request.into_inner();
        if payload.left_update.is_empty() {
            return Err(Status::invalid_argument("left_update is required"));
        }
        if payload.right_update.is_empty() {
            return Err(Status::invalid_argument("right_update is required"));
        }

        let merged_update = merge_yjs_updates(&payload.left_update, &payload.right_update)
            .map_err(|err| Status::internal(format!("failed to merge Yjs updates: {err}")))?;

        Ok(Response::new(agent::ResolveDriftResponse { merged_update }))
    }

    async fn enqueue_background_task(
        &self,
        request: Request<agent::EnqueueBackgroundTaskRequest>,
    ) -> Result<Response<agent::EnqueueBackgroundTaskResponse>, Status> {
        let payload = request.into_inner();
        let space_id = payload.space_id.trim();
        let document_id = payload.document_id.trim();
        let selection_text = payload.selection_text.trim();

        if space_id.is_empty() {
            return Err(Status::invalid_argument("space_id is required"));
        }
        if document_id.is_empty() {
            return Err(Status::invalid_argument("document_id is required"));
        }
        if selection_text.is_empty() {
            return Err(Status::invalid_argument("selection_text is required"));
        }

        let kind = proto_kind_to_store(payload.kind)
            .ok_or_else(|| Status::invalid_argument("invalid background task kind"))?;

        let record = self
            .state
            .task_store
            .enqueue(
                kind,
                space_id,
                document_id,
                selection_text,
                payload.persist_in_document,
            )
            .await
            .map_err(|err| Status::internal(err.to_string()))?;

        let record = self
            .state
            .task_store
            .mark_failed_record(record, MODEL_RPCS_DISABLED_MESSAGE)
            .await
            .map_err(|err| Status::internal(err.to_string()))?;

        Ok(Response::new(agent::EnqueueBackgroundTaskResponse {
            task: Some(map_background_task_record(record)),
        }))
    }

    async fn list_background_tasks(
        &self,
        request: Request<agent::ListBackgroundTasksRequest>,
    ) -> Result<Response<agent::ListBackgroundTasksResponse>, Status> {
        let payload = request.into_inner();
        let space_id = if payload.space_id.trim().is_empty() {
            None
        } else {
            Some(payload.space_id.trim())
        };
        let limit = if payload.limit == 0 {
            50
        } else {
            payload.limit
        };

        let tasks = self
            .state
            .task_store
            .list(space_id, limit)
            .await
            .map_err(|err| Status::internal(err.to_string()))?;

        Ok(Response::new(agent::ListBackgroundTasksResponse {
            tasks: tasks.into_iter().map(map_background_task_record).collect(),
        }))
    }
}

const MODEL_RPCS_DISABLED_MESSAGE: &str =
    "soma-agentd no longer provides model-backed RPCs; use an explicit model provider instead";

fn model_rpcs_disabled() -> Status {
    Status::unimplemented(MODEL_RPCS_DISABLED_MESSAGE)
}

fn map_model_info(m: crate::engine::ModelInfo) -> agent::ModelInfo {
    agent::ModelInfo {
        name: m.name,
        kind: agent::ModelKind::Unspecified as i32,
        path: m.path,
        loaded: m.loaded,
        size_bytes: m.size_bytes.unwrap_or_default(),
    }
}

fn map_background_task_record(record: BackgroundTaskRecord) -> agent::BackgroundTask {
    agent::BackgroundTask {
        task_id: record.task_id,
        kind: map_store_kind_to_proto(record.kind) as i32,
        status: map_store_status_to_proto(record.status) as i32,
        space_id: record.space_id,
        document_id: record.document_id,
        selection_text: record.selection_text,
        persist_in_document: record.persist_in_document,
        result_text: record.result_text.unwrap_or_default(),
        error: record.error.unwrap_or_default(),
        created_at_ms: record.created_at_ms,
        updated_at_ms: record.updated_at_ms,
    }
}

fn proto_kind_to_store(kind: i32) -> Option<StoreBackgroundTaskKind> {
    match agent::BackgroundTaskKind::try_from(kind).ok()? {
        agent::BackgroundTaskKind::ExplainSelection => {
            Some(StoreBackgroundTaskKind::ExplainSelection)
        }
        agent::BackgroundTaskKind::ExpandSelection => {
            Some(StoreBackgroundTaskKind::ExpandSelection)
        }
        agent::BackgroundTaskKind::ResearchSelection => {
            Some(StoreBackgroundTaskKind::ResearchSelection)
        }
        agent::BackgroundTaskKind::Unspecified => None,
    }
}

fn map_store_kind_to_proto(kind: StoreBackgroundTaskKind) -> agent::BackgroundTaskKind {
    match kind {
        StoreBackgroundTaskKind::ExplainSelection => agent::BackgroundTaskKind::ExplainSelection,
        StoreBackgroundTaskKind::ExpandSelection => agent::BackgroundTaskKind::ExpandSelection,
        StoreBackgroundTaskKind::ResearchSelection => agent::BackgroundTaskKind::ResearchSelection,
    }
}

fn map_store_status_to_proto(status: StoreBackgroundTaskStatus) -> agent::BackgroundTaskStatus {
    match status {
        StoreBackgroundTaskStatus::Queued => agent::BackgroundTaskStatus::Queued,
        StoreBackgroundTaskStatus::Running => agent::BackgroundTaskStatus::Running,
        StoreBackgroundTaskStatus::Succeeded => agent::BackgroundTaskStatus::Succeeded,
        StoreBackgroundTaskStatus::Failed => agent::BackgroundTaskStatus::Failed,
    }
}

fn merge_yjs_updates(left: &[u8], right: &[u8]) -> Result<Vec<u8>, String> {
    let doc = Doc::new();
    {
        let mut txn = doc.transact_mut();
        let left_update = Update::decode_v1(left).map_err(|err| format!("decode left: {err}"))?;
        txn.apply_update(left_update)
            .map_err(|err| format!("apply left: {err}"))?;
        let right_update =
            Update::decode_v1(right).map_err(|err| format!("decode right: {err}"))?;
        txn.apply_update(right_update)
            .map_err(|err| format!("apply right: {err}"))?;
    }

    let txn = doc.transact();
    Ok(txn.encode_state_as_update_v1(&StateVector::default()))
}
