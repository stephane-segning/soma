//! Spaces / membership / join surface. Mirrors the daemon's
//! `DaemonHandle` space/member/join methods 1:1; the Tauri (and future
//! HTTP) presenters wrap each fn here as a single command.

use desktop_core::error::{DesktopError, DesktopResult};
use serde::{Deserialize, Serialize};
use specta::Type;
use soma_daemon::handle_types as dt;

use crate::state::AppState;

// --- DTOs --------------------------------------------------------------------

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StoredSpace {
    pub space_id: String,
    pub display_name: String,
    pub owner_peer_id: String,
    #[specta(type = i32)]
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

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ListSpacesResult {
    pub spaces: Vec<StoredSpace>,
    pub limit: u32,
    pub offset: u32,
    pub next_offset: Option<u32>,
}

#[derive(Debug, Default, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ListSpacesArgs {
    pub q: Option<String>,
    #[serde(default)]
    pub limit: u32,
    #[serde(default)]
    pub offset: u32,
}

#[derive(Debug, Default, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CreateSpaceArgs {
    #[serde(default)]
    pub space_id: Option<String>,
    #[serde(default)]
    pub display_name: Option<String>,
}

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSpaceArgs {
    pub space_id: String,
    pub display_name: String,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StoredSpaceMember {
    pub space_id: String,
    pub peer_id: String,
    pub role: String,
    #[specta(type = i32)]
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

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StoredSpaceBot {
    pub space_id: String,
    pub peer_id: String,
    #[specta(type = i32)]
    pub expires_at: i64,
    pub alias: Option<String>,
    pub status: String,
    pub scopes: Vec<String>,
}

impl From<dt::SpaceBotRecord> for StoredSpaceBot {
    fn from(r: dt::SpaceBotRecord) -> Self {
        Self {
            space_id: r.space_id,
            peer_id: r.peer_id,
            expires_at: r.expires_at,
            alias: r.alias,
            status: r.status,
            scopes: r.scopes,
        }
    }
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StoredJoinRequest {
    pub request_id: String,
    pub space_id: String,
    pub subject_peer_id: String,
    pub display_name: String,
    pub device_name: String,
    pub requested_role: i32,
    #[specta(type = i32)]
    pub created_at: i64,
}

impl From<dt::JoinRequestRecord> for StoredJoinRequest {
    fn from(r: dt::JoinRequestRecord) -> Self {
        Self {
            request_id: r.request_id,
            space_id: r.space_id,
            subject_peer_id: r.subject_peer_id,
            display_name: r.display_name,
            device_name: r.device_name,
            requested_role: r.requested_role,
            created_at: r.created_at,
        }
    }
}

#[derive(Debug, Deserialize, Type)]
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

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct JoinSpaceResult {
    pub request_id: String,
}

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DecideJoinArgs {
    pub request_id: String,
    pub approve: bool,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub reason: String,
}

#[derive(Debug, Serialize, Type)]
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

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RevokeMemberArgs {
    pub space_id: String,
    pub subject_peer_id: String,
    #[serde(default)]
    pub reason: String,
}

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct IssueIssuerCapabilityArgs {
    pub space_id: String,
    pub target_peer_id: String,
    #[specta(type = i32)]
    pub expires_at: i64,
    #[serde(default)]
    pub alias: Option<String>,
    #[serde(default)]
    pub scopes: Vec<String>,
}

// --- Handlers ----------------------------------------------------------------

const DEFAULT_LIST_LIMIT: u32 = 50;

fn err(e: impl std::fmt::Display) -> DesktopError {
    DesktopError::Daemon { message: e.to_string() }
}

pub async fn list(state: &AppState, args: ListSpacesArgs) -> DesktopResult<ListSpacesResult> {
    let handle = state.daemon.handle().await?;
    let out = handle
        .list_spaces(dt::ListSpacesInput {
            q: args.q,
            limit: if args.limit == 0 { DEFAULT_LIST_LIMIT } else { args.limit },
            offset: args.offset,
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

pub async fn create(state: &AppState, args: CreateSpaceArgs) -> DesktopResult<StoredSpace> {
    let handle = state.daemon.handle().await?;
    let res = handle
        .create_space(dt::CreateSpaceInput {
            space_id: args.space_id.unwrap_or_default(),
            display_name: args.display_name.unwrap_or_default(),
        })
        .await
        .map_err(err)?;
    Ok(handle.get_space(&res.space_id).await.map_err(err)?.into())
}

pub async fn get(state: &AppState, space_id: String) -> DesktopResult<StoredSpace> {
    let handle = state.daemon.handle().await?;
    Ok(handle.get_space(&space_id).await.map_err(err)?.into())
}

pub async fn update(state: &AppState, args: UpdateSpaceArgs) -> DesktopResult<StoredSpace> {
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

pub async fn delete(state: &AppState, space_id: String) -> DesktopResult<bool> {
    let handle = state.daemon.handle().await?;
    handle.delete_space(&space_id).await.map_err(err)
}

pub async fn list_members(state: &AppState, space_id: String) -> DesktopResult<Vec<StoredSpaceMember>> {
    let handle = state.daemon.handle().await?;
    let members = handle.list_space_members(&space_id).await.map_err(err)?;
    Ok(members.into_iter().map(StoredSpaceMember::from).collect())
}

pub async fn list_my_memberships(state: &AppState) -> DesktopResult<Vec<StoredSpaceMember>> {
    let handle = state.daemon.handle().await?;
    let members = handle.list_my_memberships().await.map_err(err)?;
    Ok(members.into_iter().map(StoredSpaceMember::from).collect())
}

pub async fn list_bots(state: &AppState, space_id: String) -> DesktopResult<Vec<StoredSpaceBot>> {
    let handle = state.daemon.handle().await?;
    let bots = handle.list_space_bots(&space_id).await.map_err(err)?;
    Ok(bots.into_iter().map(StoredSpaceBot::from).collect())
}

pub async fn join(state: &AppState, args: JoinSpaceArgs) -> DesktopResult<JoinSpaceResult> {
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

pub async fn decide_join(state: &AppState, args: DecideJoinArgs) -> DesktopResult<DecideJoinResult> {
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

pub async fn list_join_requests(state: &AppState) -> DesktopResult<Vec<StoredJoinRequest>> {
    let handle = state.daemon.handle().await?;
    let requests = handle.list_join_requests().await.map_err(err)?;
    Ok(requests.into_iter().map(StoredJoinRequest::from).collect())
}

pub async fn revoke_member(state: &AppState, args: RevokeMemberArgs) -> DesktopResult<bool> {
    let handle = state.daemon.handle().await?;
    handle
        .revoke_space(dt::RevokeSpaceInput {
            space_id: args.space_id,
            subject_peer_id: args.subject_peer_id,
            reason: args.reason,
        })
        .await
        .map_err(err)
}

pub async fn issue_issuer_capability(state: &AppState, args: IssueIssuerCapabilityArgs) -> DesktopResult<bool> {
    let handle = state.daemon.handle().await?;
    handle
        .issue_issuer_capability(dt::IssueIssuerCapabilityInput {
            space_id: args.space_id,
            target_peer_id: args.target_peer_id,
            expires_at: args.expires_at,
            alias: args.alias,
            scopes: args.scopes,
        })
        .await
        .map_err(err)
}
