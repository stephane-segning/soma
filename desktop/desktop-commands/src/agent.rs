//! Tauri presenter for `desktop_api::agent::*`.

use desktop_agent::{
    BackgroundTask, EnqueueBackgroundTaskParams, ListBackgroundTasksParams, RerankParams, RerankResult,
    ResolveDriftParams, ResolveDriftResult,
};
use desktop_api::{
    AppState,
    agent::{self as api, AgentModel, ChatStreamArgs},
};
use desktop_core::error::DesktopResult;
use desktop_agent::ChatResponse;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn agent_chat_stream(state: State<'_, AppState>, args: ChatStreamArgs) -> DesktopResult<ChatResponse> {
    api::chat_stream(state.inner(), args).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_list_models(state: State<'_, AppState>, space_id: Option<String>) -> DesktopResult<Vec<AgentModel>> {
    api::list_models(state.inner(), space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_rerank(state: State<'_, AppState>, args: RerankParams) -> DesktopResult<Vec<RerankResult>> {
    api::rerank(state.inner(), args).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_resolve_drift(
    state: State<'_, AppState>,
    args: ResolveDriftParams,
) -> DesktopResult<ResolveDriftResult> {
    api::resolve_drift(state.inner(), args).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_enqueue_background_task(
    state: State<'_, AppState>,
    args: EnqueueBackgroundTaskParams,
) -> DesktopResult<BackgroundTask> {
    api::enqueue_background_task(state.inner(), args).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_list_background_tasks(
    state: State<'_, AppState>,
    args: Option<ListBackgroundTasksParams>,
) -> DesktopResult<Vec<BackgroundTask>> {
    api::list_background_tasks(state.inner(), args.unwrap_or_default()).await
}
