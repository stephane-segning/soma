//! Agent handlers — chat, model listing, rerank, drift, background tasks.
//! Re-exports the agent-side DTOs from `desktop_agent` so the SDK gets a
//! single import path.

pub use desktop_agent::{AgentModel, BackgroundTask};

use desktop_agent::{
    ChatMessage, ChatOptions, ChatResponse, EnqueueBackgroundTaskParams, ListBackgroundTasksParams, RerankParams,
    RerankResult, ResolveDriftParams, ResolveDriftResult,
};
use desktop_core::error::DesktopResult;
use serde::Deserialize;

use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct ChatStreamArgs {
    #[serde(default)]
    pub messages: Vec<ChatMessage>,
    #[serde(flatten)]
    pub options: ChatOptions,
}

pub async fn chat_stream(state: &AppState, args: ChatStreamArgs) -> DesktopResult<ChatResponse> {
    Ok(state.agent.chat(&args.messages, &args.options).await)
}

pub async fn list_models(state: &AppState, space_id: Option<String>) -> DesktopResult<Vec<AgentModel>> {
    state.agent.list_models(space_id.as_deref()).await
}

pub async fn rerank(state: &AppState, args: RerankParams) -> DesktopResult<Vec<RerankResult>> {
    state.agent.rerank(&args).await
}

pub async fn resolve_drift(state: &AppState, args: ResolveDriftParams) -> DesktopResult<ResolveDriftResult> {
    state.agent.resolve_drift(&args).await
}

pub async fn enqueue_background_task(state: &AppState, args: EnqueueBackgroundTaskParams) -> DesktopResult<BackgroundTask> {
    state.agent.enqueue_background_task(args).await
}

pub async fn list_background_tasks(state: &AppState, args: ListBackgroundTasksParams) -> DesktopResult<Vec<BackgroundTask>> {
    Ok(state.agent.list_background_tasks(&args).await)
}
