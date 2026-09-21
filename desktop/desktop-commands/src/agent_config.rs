//! Tauri presenter for `desktop_api::agent_config::*`.

use desktop_api::{
    AppState,
    agent_config::{
        self as api, AgentProviderConfigView, SetDefaultAgentProviderConfigArgs,
        SetSpaceAgentProviderConfigArgs, ValidateAgentProviderConfigArgs,
        ValidateAgentProviderConfigResult,
    },
};
use desktop_core::error::DesktopResult;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn agent_config_get_default(
    state: State<'_, AppState>,
) -> DesktopResult<AgentProviderConfigView> {
    api::get_default(state.inner()).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_config_get_space(
    state: State<'_, AppState>,
    space_id: String,
) -> DesktopResult<AgentProviderConfigView> {
    api::get_space(state.inner(), space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_config_set_default(
    state: State<'_, AppState>,
    args: SetDefaultAgentProviderConfigArgs,
) -> DesktopResult<AgentProviderConfigView> {
    api::set_default(state.inner(), args).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_config_set_space(
    state: State<'_, AppState>,
    args: SetSpaceAgentProviderConfigArgs,
) -> DesktopResult<AgentProviderConfigView> {
    api::set_space(state.inner(), args).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_config_clear_default(state: State<'_, AppState>) -> DesktopResult<bool> {
    api::clear_default(state.inner()).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_config_clear_space(
    state: State<'_, AppState>,
    space_id: String,
) -> DesktopResult<bool> {
    api::clear_space(state.inner(), space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_config_validate(
    state: State<'_, AppState>,
    args: ValidateAgentProviderConfigArgs,
) -> DesktopResult<ValidateAgentProviderConfigResult> {
    api::validate(state.inner(), args).await
}
