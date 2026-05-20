//! Tauri presenter for `desktop_api::spaces::*`. Re-exports the DTOs so
//! the SDK codegen sees them through this crate too.

use desktop_api::{
    AppState,
    spaces::{
        self as api, CreateSpaceArgs, DecideJoinArgs, DecideJoinResult, IssueIssuerCapabilityArgs, JoinSpaceArgs,
        JoinSpaceResult, ListSpacesArgs, ListSpacesResult, RevokeMemberArgs, StoredJoinRequest, StoredSpace,
        StoredSpaceBot, StoredSpaceMember, UpdateSpaceArgs,
    },
};
use desktop_core::error::DesktopResult;
use tauri::State;

#[tauri::command]
pub async fn spaces_list(state: State<'_, AppState>, args: Option<ListSpacesArgs>) -> DesktopResult<ListSpacesResult> {
    api::list(state.inner(), args.unwrap_or_default()).await
}

#[tauri::command]
pub async fn spaces_create(state: State<'_, AppState>, args: Option<CreateSpaceArgs>) -> DesktopResult<StoredSpace> {
    api::create(state.inner(), args.unwrap_or_default()).await
}

#[tauri::command]
pub async fn spaces_get(state: State<'_, AppState>, space_id: String) -> DesktopResult<StoredSpace> {
    api::get(state.inner(), space_id).await
}

#[tauri::command]
pub async fn spaces_update(state: State<'_, AppState>, args: UpdateSpaceArgs) -> DesktopResult<StoredSpace> {
    api::update(state.inner(), args).await
}

#[tauri::command]
pub async fn spaces_delete(state: State<'_, AppState>, space_id: String) -> DesktopResult<bool> {
    api::delete(state.inner(), space_id).await
}

#[tauri::command]
pub async fn spaces_list_members(state: State<'_, AppState>, space_id: String) -> DesktopResult<Vec<StoredSpaceMember>> {
    api::list_members(state.inner(), space_id).await
}

#[tauri::command]
pub async fn spaces_list_my_memberships(state: State<'_, AppState>) -> DesktopResult<Vec<StoredSpaceMember>> {
    api::list_my_memberships(state.inner()).await
}

#[tauri::command]
pub async fn spaces_list_bots(state: State<'_, AppState>, space_id: String) -> DesktopResult<Vec<StoredSpaceBot>> {
    api::list_bots(state.inner(), space_id).await
}

#[tauri::command]
pub async fn spaces_join(state: State<'_, AppState>, args: JoinSpaceArgs) -> DesktopResult<JoinSpaceResult> {
    api::join(state.inner(), args).await
}

#[tauri::command]
pub async fn spaces_decide_join(state: State<'_, AppState>, args: DecideJoinArgs) -> DesktopResult<DecideJoinResult> {
    api::decide_join(state.inner(), args).await
}

#[tauri::command]
pub async fn spaces_list_join_requests(state: State<'_, AppState>) -> DesktopResult<Vec<StoredJoinRequest>> {
    api::list_join_requests(state.inner()).await
}

#[tauri::command]
pub async fn spaces_revoke_member(state: State<'_, AppState>, args: RevokeMemberArgs) -> DesktopResult<bool> {
    api::revoke_member(state.inner(), args).await
}

#[tauri::command]
pub async fn spaces_issue_issuer_capability(
    state: State<'_, AppState>,
    args: IssueIssuerCapabilityArgs,
) -> DesktopResult<bool> {
    api::issue_issuer_capability(state.inner(), args).await
}
