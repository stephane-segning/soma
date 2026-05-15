use std::{pin::Pin, sync::Arc};

use futures::Stream;
use soma_proto_build::agent;
use tonic::{Request, Response, Status};

use crate::{
    engine::{EngineHandle, EngineStatus},
    tasks::BackgroundTaskStore,
};

use super::models::map_model_info;

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

    pub(super) async fn status_inner(&self) -> Result<EngineStatus, Status> {
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
        super::chat::inline_complete(self, request).await
    }

    async fn chat(
        &self,
        request: Request<agent::ChatRequest>,
    ) -> Result<Response<agent::ChatResponse>, Status> {
        super::chat::chat(self, request).await
    }

    type ChatStreamStream =
        Pin<Box<dyn Stream<Item = Result<agent::ChatStreamEvent, Status>> + Send + 'static>>;

    async fn chat_stream(
        &self,
        request: Request<agent::ChatRequest>,
    ) -> Result<Response<Self::ChatStreamStream>, Status> {
        super::chat::chat_stream(self, request).await
    }

    async fn embed(
        &self,
        request: Request<agent::EmbedRequest>,
    ) -> Result<Response<agent::EmbedResponse>, Status> {
        super::chat::embed(self, request).await
    }

    async fn rerank(
        &self,
        request: Request<agent::RerankRequest>,
    ) -> Result<Response<agent::RerankResponse>, Status> {
        super::rerank::rerank(self, request).await
    }

    async fn resolve_drift(
        &self,
        request: Request<agent::ResolveDriftRequest>,
    ) -> Result<Response<agent::ResolveDriftResponse>, Status> {
        super::drift::resolve_drift(request).await
    }

    async fn enqueue_background_task(
        &self,
        request: Request<agent::EnqueueBackgroundTaskRequest>,
    ) -> Result<Response<agent::EnqueueBackgroundTaskResponse>, Status> {
        super::background::enqueue_background_task(self, request).await
    }

    async fn list_background_tasks(
        &self,
        request: Request<agent::ListBackgroundTasksRequest>,
    ) -> Result<Response<agent::ListBackgroundTasksResponse>, Status> {
        super::background::list_background_tasks(self, request).await
    }
}
