//! Tauri presenter for `desktop_api::invites::*`. Re-exports the DTOs so
//! the SDK codegen sees them through this crate too — same pattern as
//! `spaces.rs`.

use desktop_api::{
    AppState,
    invites::{
        self as api, CreateInviteArgs, InviteInspection, RedeemInviteArgs, RedeemInviteResult,
        RevokeInviteArgs, StoredInvite,
    },
};
use desktop_core::error::DesktopResult;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn invites_create(
    state: State<'_, AppState>,
    args: CreateInviteArgs,
) -> DesktopResult<StoredInvite> {
    api::create(state.inner(), args).await
}

#[tauri::command]
#[specta::specta]
pub async fn invites_list(
    state: State<'_, AppState>,
    space_id: String,
) -> DesktopResult<Vec<StoredInvite>> {
    api::list(state.inner(), space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn invites_revoke(
    state: State<'_, AppState>,
    args: RevokeInviteArgs,
) -> DesktopResult<bool> {
    api::revoke(state.inner(), args).await
}

/// Decode + offline-verify a `soma://invite/...` link. Touches no
/// network — safe to call before the user chooses to redeem it.
#[tauri::command]
#[specta::specta]
pub async fn invites_inspect(
    state: State<'_, AppState>,
    link: String,
) -> DesktopResult<InviteInspection> {
    api::inspect(state.inner(), link).await
}

#[tauri::command]
#[specta::specta]
pub async fn invites_redeem(
    state: State<'_, AppState>,
    args: RedeemInviteArgs,
) -> DesktopResult<RedeemInviteResult> {
    api::redeem(state.inner(), args).await
}
