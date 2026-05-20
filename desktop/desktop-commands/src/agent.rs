//! Agent commands. Replaces `controllers/agent-controller.ts` +
//! `command-registry/agent-handlers.ts`. Each fn forwards directly to
//! `AgentService`; the service owns all business logic.

use std::sync::Arc;

use desktop_agent::{
    AgentService, ChatMessage, ChatOptions, ChatResponse, EnqueueBackgroundTaskParams, ListBackgroundTasksParams,
    RerankParams, ResolveDriftParams,
};
use desktop_core::error::DesktopResult;
use tauri::State;

#[derive(Debug, serde::Deserialize)]
pub struct ChatStreamArgs {
    #[serde(default)]
    pub messages: Vec<ChatMessage>,
    #[serde(flatten)]
    pub options: ChatOptions,
}

#[tauri::command]
pub async fn agent_chat_stream(state: State<'_, Arc<AgentService>>, args: ChatStreamArgs) -> DesktopResult<ChatResponse> {
    Ok(state.chat(&args.messages, &args.options).await)
}

#[tauri::command]
pub async fn agent_list_models(
    state: State<'_, Arc<AgentService>>,
    space_id: Option<String>,
) -> DesktopResult<Vec<desktop_agent::AgentModel>> {
    state.list_models(space_id.as_deref()).await
}

#[tauri::command]
pub async fn agent_rerank(
    state: State<'_, Arc<AgentService>>,
    args: RerankParams,
) -> DesktopResult<Vec<desktop_agent::RerankResult>> {
    state.rerank(&args).await
}

#[tauri::command]
pub async fn agent_resolve_drift(
    state: State<'_, Arc<AgentService>>,
    args: ResolveDriftParams,
) -> DesktopResult<desktop_agent::ResolveDriftResult> {
    state.resolve_drift(&args).await
}

#[tauri::command]
pub async fn agent_enqueue_background_task(
    state: State<'_, Arc<AgentService>>,
    args: EnqueueBackgroundTaskParams,
) -> DesktopResult<desktop_agent::BackgroundTask> {
    state.enqueue_background_task(args).await
}

#[tauri::command]
pub async fn agent_list_background_tasks(
    state: State<'_, Arc<AgentService>>,
    args: Option<ListBackgroundTasksParams>,
) -> DesktopResult<Vec<desktop_agent::BackgroundTask>> {
    Ok(state.list_background_tasks(&args.unwrap_or_default()).await)
}
