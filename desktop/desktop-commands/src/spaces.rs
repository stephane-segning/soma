//! Spaces / membership / join surface — replaces
//! `desktop/soma/src/main/controllers/spaces-controller.ts` +
//! `command-registry/space-handlers.ts` from the Electron app.
//!
//! Talks straight to `soma_daemon::DaemonHandle`; the old TS `DaemonClient`
//! facade is unnecessary in a single-binary setup.

use desktop_core::error::{DesktopError, DesktopResult};
use serde::{Deserialize, Serialize};
use soma_daemon::handle_types as dt;
use tauri::State;

use crate::state::AppState;

// --- DTOs -------------------------------------------------------------------
// camelCase on the wire so the renderer's existing types keep working
// without a shim layer.

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredSpace {
    pub space_id: String,
    pub display_name: String,
    pub owner_peer_id: String,
    pub created_at: i64,
}

impl From<dt::SpaceRecord> for StoredSpace {
    fn from(r: dt::SpaceRecord) -> Self {
        Self {
            space_id: r.space_id,
            display_name: r.display_name,
            owner_peer_id: r.owner_peer_id,
            created_at: r.created_at,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListSpacesResult {
    pub spaces: Vec<StoredSpace>,
    pub limit: u32,
    pub offset: u32,
    pub next_offset: Option<u32>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ListSpacesArgs {
    pub q: Option<String>,
    #[serde(default)]
    pub limit: u32,
    #[serde(default)]
    pub offset: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSpaceArgs {
    pub space_id: String,
    pub display_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredSpaceMember {
    pub space_id: String,
    pub peer_id: String,
    pub role: String,
    pub expires_at: i64,
}

impl From<dt::SpaceMemberRecord> for StoredSpaceMember {
    fn from(r: dt::SpaceMemberRecord) -> Self {
        Self {
            space_id: r.space_id,
            peer_id: r.peer_id,
            role: r.role,
            expires_at: r.expires_at,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinSpaceArgs {
    pub space_id: String,
    pub target_peer_id: String,
    pub target_multiaddrs: Vec<String>,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub device_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinSpaceResult {
    pub request_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecideJoinArgs {
    pub request_id: String,
    pub approve: bool,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecideJoinResult {
    pub decision_id: String,
    pub space_id: String,
    pub subject_peer_id: String,
    pub decision: i32,
    pub reason: String,
    pub approved: bool,
}

impl From<dt::JoinDecisionRecord> for DecideJoinResult {
    fn from(r: dt::JoinDecisionRecord) -> Self {
        Self {
            decision_id: r.decision_id,
            space_id: r.space_id,
            subject_peer_id: r.subject_peer_id,
            decision: r.decision,
            reason: r.reason,
            approved: r.approved,
        }
    }
}

// --- Commands ---------------------------------------------------------------

fn err(e: impl std::fmt::Display) -> DesktopError {
    DesktopError::Daemon { message: e.to_string() }
}

#[tauri::command]
pub async fn list_spaces(state: State<'_, AppState>, args: Option<ListSpacesArgs>) -> DesktopResult<ListSpacesResult> {
    let handle = state.daemon.handle().await?;
    let a = args.unwrap_or_default();
    let out = handle
        .list_spaces(dt::ListSpacesInput {
            q: a.q,
            limit: a.limit,
            offset: a.offset,
        })
        .await
        .map_err(err)?;
    Ok(ListSpacesResult {
        spaces: out.spaces.into_iter().map(StoredSpace::from).collect(),
        limit: out.limit,
        offset: out.offset,
        next_offset: out.next_offset,
    })
}

#[tauri::command]
pub async fn create_space(state: State<'_, AppState>, args: CreateSpaceArgs) -> DesktopResult<StoredSpace> {
    let handle = state.daemon.handle().await?;
    handle
        .create_space(dt::CreateSpaceInput {
            space_id: args.space_id.clone(),
            display_name: args.display_name.clone(),
        })
        .await
        .map_err(err)?;
    let record = handle.get_space(&args.space_id).await.map_err(err)?;
    Ok(record.into())
}

#[tauri::command]
pub async fn get_space(state: State<'_, AppState>, space_id: String) -> DesktopResult<StoredSpace> {
    let handle = state.daemon.handle().await?;
    let record = handle.get_space(&space_id).await.map_err(err)?;
    Ok(record.into())
}

#[tauri::command]
pub async fn update_space(state: State<'_, AppState>, args: CreateSpaceArgs) -> DesktopResult<StoredSpace> {
    let handle = state.daemon.handle().await?;
    let record = handle
        .update_space(dt::UpdateSpaceInput {
            space_id: args.space_id,
            display_name: args.display_name,
        })
        .await
        .map_err(err)?;
    Ok(record.into())
}

#[tauri::command]
pub async fn delete_space(state: State<'_, AppState>, space_id: String) -> DesktopResult<bool> {
    let handle = state.daemon.handle().await?;
    handle.delete_space(&space_id).await.map_err(err)
}

#[tauri::command]
pub async fn list_space_members(
    state: State<'_, AppState>,
    space_id: String,
) -> DesktopResult<Vec<StoredSpaceMember>> {
    let handle = state.daemon.handle().await?;
    let members = handle.list_space_members(&space_id).await.map_err(err)?;
    Ok(members.into_iter().map(StoredSpaceMember::from).collect())
}

#[tauri::command]
pub async fn list_my_memberships(state: State<'_, AppState>) -> DesktopResult<Vec<StoredSpaceMember>> {
    let handle = state.daemon.handle().await?;
    let members = handle.list_my_memberships().await.map_err(err)?;
    Ok(members.into_iter().map(StoredSpaceMember::from).collect())
}

#[tauri::command]
pub async fn join_space(state: State<'_, AppState>, args: JoinSpaceArgs) -> DesktopResult<JoinSpaceResult> {
    let handle = state.daemon.handle().await?;
    let request_id = handle
        .join_space(dt::JoinSpaceInput {
            space_id: args.space_id,
            display_name: args.display_name,
            device_name: args.device_name,
            target_peer_id: args.target_peer_id,
            target_multiaddrs: args.target_multiaddrs,
        })
        .await
        .map_err(err)?;
    Ok(JoinSpaceResult { request_id })
}

#[tauri::command]
pub async fn decide_join(state: State<'_, AppState>, args: DecideJoinArgs) -> DesktopResult<DecideJoinResult> {
    let handle = state.daemon.handle().await?;
    let record = handle
        .decide_join(dt::DecideJoinInput {
            request_id: args.request_id,
            approve: args.approve,
            role: args.role,
            reason: args.reason,
        })
        .await
        .map_err(err)?;
    Ok(record.into())
}
