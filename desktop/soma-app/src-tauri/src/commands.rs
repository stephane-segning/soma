use serde::de::DeserializeOwned;
use tauri::State;
use tracing::debug;

use crate::error::{AppError, AppResult};
use crate::handlers::agent::{AgentController, ChatParams, ChatStreamEvent};
use crate::handlers::blobs::{BlobStageParams, BlobStageResult, BlobsController};
use crate::handlers::documents::{
    DocumentsController, DraftRecord, EnsurePageParams, GetDraftParams, ListPagesParams,
    PageRecord, QueueDaemonSyncParams, SetPageParentsParams, SyncPublishedParams,
    UpdatePageTitleParams, UpsertDraftParams,
};
use crate::handlers::remember::{RememberController, RememberRouteParams};
use crate::handlers::search::{SearchController, SearchParams, SearchResult};
use crate::handlers::settings::{
    SettingsController, SettingsGetParams, SettingsLastRouteParams, SettingsSetParams,
};
use crate::handlers::spaces::{
    SpaceDto, SpacesController, SpacesCreateParams, SpacesDeleteParams, SpacesGetParams,
    SpacesListParams, SpacesListResponse, SpacesUpdateParams,
};

fn parse_params<T: DeserializeOwned>(
    request: &tauri::ipc::Request<'_>,
    command: &'static str,
) -> AppResult<T> {
    let value = match request.body() {
        tauri::ipc::InvokeBody::Json(data) => data.clone(),
        _ => {
            return Err(AppError::BadRequest(format!(
                "{command}: request body must be JSON"
            )));
        }
    };

    serde_json::from_value(value).map_err(AppError::from)
}

#[tauri::command]
pub async fn remember_route(
    controller: State<'_, RememberController>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<()> {
    let params: RememberRouteParams = parse_params(&request, "remember_route")?;
    debug!("Remember route: {:?}", params);
    controller.remember_route(params)
}

#[tauri::command]
pub async fn documents_upsert_draft(
    controller: State<'_, DocumentsController>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<()> {
    let params: UpsertDraftParams = parse_params(&request, "documents_upsert_draft")?;
    controller.upsert_draft(params).await
}

#[tauri::command]
pub async fn documents_queue_daemon_sync(
    controller: State<'_, DocumentsController>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<()> {
    let params: QueueDaemonSyncParams = parse_params(&request, "documents_queue_daemon_sync")?;
    controller.queue_daemon_sync(params).await
}

#[tauri::command]
pub async fn documents_sync_published(
    controller: State<'_, DocumentsController>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<i32> {
    let params: SyncPublishedParams = parse_params(&request, "documents_sync_published")?;
    controller.sync_published(params).await
}

#[tauri::command]
pub async fn documents_get_draft(
    controller: State<'_, DocumentsController>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<Option<DraftRecord>> {
    let params: GetDraftParams = parse_params(&request, "documents_get_draft")?;
    controller.get_draft(params)
}

#[tauri::command]
pub async fn documents_ensure_page(
    controller: State<'_, DocumentsController>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<PageRecord> {
    let params: EnsurePageParams = parse_params(&request, "documents_ensure_page")?;
    controller.ensure_page(params)
}

#[tauri::command]
pub async fn documents_list_pages(
    controller: State<'_, DocumentsController>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<Vec<PageRecord>> {
    let params: ListPagesParams = parse_params(&request, "documents_list_pages")?;
    controller.list_pages(params)
}

#[tauri::command]
pub async fn documents_update_page_title(
    controller: State<'_, DocumentsController>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<Option<PageRecord>> {
    let params: UpdatePageTitleParams = parse_params(&request, "documents_update_page_title")?;
    controller.update_page_title(params)
}

#[tauri::command]
pub async fn documents_set_page_parents(
    controller: State<'_, DocumentsController>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<Option<PageRecord>> {
    let params: SetPageParentsParams = parse_params(&request, "documents_set_page_parents")?;
    controller.set_page_parents(params)
}

#[tauri::command]
pub async fn blobs_stage(
    controller: State<'_, BlobsController>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<BlobStageResult> {
    let params: BlobStageParams = parse_params(&request, "blobs_stage")?;
    controller.stage(params).await
}

#[tauri::command]
pub async fn spaces_list(
    controller: State<'_, SpacesController>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<SpacesListResponse> {
    let params: SpacesListParams = parse_params(&request, "spaces_list")?;
    controller.list(params).await
}

#[tauri::command]
pub async fn spaces_create(
    controller: State<'_, SpacesController>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<SpaceDto> {
    let params: SpacesCreateParams = parse_params(&request, "spaces_create")?;
    controller.create(params).await
}

#[tauri::command]
pub async fn spaces_get(
    controller: State<'_, SpacesController>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<SpaceDto> {
    let params: SpacesGetParams = parse_params(&request, "spaces_get")?;
    controller.get(params).await
}

#[tauri::command]
pub async fn spaces_update(
    controller: State<'_, SpacesController>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<SpaceDto> {
    let params: SpacesUpdateParams = parse_params(&request, "spaces_update")?;
    controller.update(params).await
}

#[tauri::command]
pub async fn spaces_delete(
    controller: State<'_, SpacesController>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<bool> {
    let params: SpacesDeleteParams = parse_params(&request, "spaces_delete")?;
    controller.delete(params).await
}

#[tauri::command]
pub async fn agent_chat_stream(
    controller: State<'_, AgentController>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<ChatStreamEvent> {
    let params: ChatParams = parse_params(&request, "agent_chat_stream")?;
    controller.chat_stream(params).await
}

#[tauri::command]
pub async fn search(
    controller: State<'_, SearchController>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<Vec<SearchResult>> {
    let params: SearchParams = parse_params(&request, "search")?;
    controller.search(params)
}

#[tauri::command]
pub async fn settings_get_last_route(
    controller: State<'_, SettingsController>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<Option<String>> {
    let _: SettingsLastRouteParams = parse_params(&request, "settings_get_last_route")?;
    controller.get_last_route()
}

#[tauri::command]
pub async fn settings_get(
    controller: State<'_, SettingsController>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<Option<serde_json::Value>> {
    let params: SettingsGetParams = parse_params(&request, "settings_get")?;
    controller.get(params)
}

#[tauri::command]
pub async fn settings_set(
    controller: State<'_, SettingsController>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<()> {
    let params: SettingsSetParams = parse_params(&request, "settings_set")?;
    controller.set(params)
}
