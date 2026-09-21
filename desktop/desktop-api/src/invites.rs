//! Space invite surface. Mirrors `desktop_api::spaces`'s pattern exactly:
//! DTOs + thin handlers over `DaemonHandle`'s invite methods. Split into
//! its own module (rather than folded into `spaces.rs`) because invites
//! are a large-enough, self-contained concern on their own — same
//! rationale as `agent_config.rs` / `blobs.rs` being their own modules.

use desktop_core::error::{DesktopError, DesktopResult};
use serde::{Deserialize, Serialize};
use soma_daemon::handle_types as dt;
use specta::Type;

use crate::state::AppState;

// --- DTOs --------------------------------------------------------------------

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CreateInviteArgs {
    pub space_id: String,
    /// Role string ("owner"/"editor"/"viewer"/"member"/"bot"); empty
    /// defaults to "member".
    #[serde(default)]
    pub role: String,
    /// Seconds from now until expiry. `0` means "never expires".
    #[specta(type = i32)]
    pub ttl_secs: i64,
    #[serde(default)]
    pub label: String,
    /// `false` (the default) makes the invite redeemable exactly once.
    #[serde(default)]
    pub multi_use: bool,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct StoredInvite {
    pub space_id: String,
    /// Opaque id `RevokeInviteArgs.id` takes back.
    pub id: String,
    /// The full `soma://invite/...` link, ready to share.
    pub link: String,
    pub issuer_peer_id: String,
    pub role: String,
    /// Unix-seconds; `0` means never expires.
    #[specta(type = i32)]
    pub expires_at: i64,
    pub label: String,
    pub multi_use: bool,
    #[specta(type = i32)]
    pub created_at: i64,
    /// Unix-seconds; `0` means not revoked.
    #[specta(type = i32)]
    pub revoked_at: i64,
    #[specta(type = i32)]
    pub redeemed_count: i64,
}

impl From<dt::InviteRecord> for StoredInvite {
    fn from(r: dt::InviteRecord) -> Self {
        Self {
            space_id: r.space_id,
            id: r.id,
            link: r.link,
            issuer_peer_id: r.issuer_peer_id,
            role: r.role,
            expires_at: r.expires_at,
            label: r.label,
            multi_use: r.multi_use,
            created_at: r.created_at,
            revoked_at: r.revoked_at,
            redeemed_count: r.redeemed_count,
        }
    }
}

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RevokeInviteArgs {
    pub space_id: String,
    pub id: String,
}

/// Why an inspected invite link is or isn't usable.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum InviteValidity {
    Valid,
    /// Decoded, but the signature doesn't verify (forged, corrupted, or
    /// hand-edited).
    InvalidSignature,
    /// Decoded and signature-valid, but past its expiry.
    Expired,
    /// Not a well-formed `soma://invite/...` link at all.
    Malformed,
}

impl From<dt::InviteValidity> for InviteValidity {
    fn from(v: dt::InviteValidity) -> Self {
        match v {
            dt::InviteValidity::Valid => Self::Valid,
            dt::InviteValidity::InvalidSignature => Self::InvalidSignature,
            dt::InviteValidity::Expired => Self::Expired,
            dt::InviteValidity::Malformed => Self::Malformed,
        }
    }
}

/// Result of decoding + offline-verifying a `soma://invite/...` link —
/// see `inspect`'s doc comment: this never touches the network.
#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct InviteInspection {
    pub validity: InviteValidity,
    pub space_id: Option<String>,
    pub space_label: Option<String>,
    pub role: Option<String>,
    /// The verified issuer when `validity == "valid"`; the UNVERIFIED
    /// claimed signer otherwise (UI display only — never a trust
    /// decision unless `validity == "valid"`).
    pub issuer_peer_id: Option<String>,
    /// Unix-seconds. `null` means "never expires".
    #[specta(type = Option<i32>)]
    pub expires_at: Option<i64>,
    pub bootstrap_multiaddrs: Vec<String>,
}

impl From<dt::InviteInspectionRecord> for InviteInspection {
    fn from(r: dt::InviteInspectionRecord) -> Self {
        Self {
            validity: r.validity.into(),
            space_id: r.space_id,
            space_label: r.space_label,
            role: r.role,
            issuer_peer_id: r.issuer_peer_id,
            expires_at: r.expires_at,
            bootstrap_multiaddrs: r.bootstrap_multiaddrs,
        }
    }
}

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RedeemInviteArgs {
    pub link: String,
    #[serde(default)]
    pub display_name: String,
    #[serde(default)]
    pub device_name: String,
}

#[derive(Debug, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RedeemInviteResult {
    pub request_id: String,
}

// --- Handlers ----------------------------------------------------------------

fn err(e: impl std::fmt::Display) -> DesktopError {
    DesktopError::Daemon {
        message: e.to_string(),
    }
}

pub async fn create(state: &AppState, args: CreateInviteArgs) -> DesktopResult<StoredInvite> {
    let handle = state.daemon.handle().await?;
    let record = handle
        .create_invite(dt::CreateInviteInput {
            space_id: args.space_id,
            role: args.role,
            ttl_secs: args.ttl_secs,
            label: args.label,
            multi_use: args.multi_use,
        })
        .await
        .map_err(err)?;
    Ok(record.into())
}

pub async fn list(state: &AppState, space_id: String) -> DesktopResult<Vec<StoredInvite>> {
    let handle = state.daemon.handle().await?;
    let rows = handle.list_invites(&space_id).await.map_err(err)?;
    Ok(rows.into_iter().map(StoredInvite::from).collect())
}

pub async fn revoke(state: &AppState, args: RevokeInviteArgs) -> DesktopResult<bool> {
    let handle = state.daemon.handle().await?;
    handle
        .revoke_invite(dt::RevokeInviteInput {
            space_id: args.space_id,
            id: args.id,
        })
        .await
        .map_err(err)
}

/// Decode + offline-verify a `soma://invite/...` link. Deliberately calls
/// only `DaemonHandle::inspect_invite_link`, which is sync and touches no
/// network — the renderer can show a trustworthy confirmation screen
/// before the user ever chooses to dial anyone.
pub async fn inspect(state: &AppState, link: String) -> DesktopResult<InviteInspection> {
    let handle = state.daemon.handle().await?;
    Ok(handle.inspect_invite_link(&link).into())
}

pub async fn redeem(state: &AppState, args: RedeemInviteArgs) -> DesktopResult<RedeemInviteResult> {
    let handle = state.daemon.handle().await?;
    let request_id = handle
        .redeem_invite(dt::RedeemInviteInput {
            link: args.link,
            display_name: args.display_name,
            device_name: args.device_name,
        })
        .await
        .map_err(err)?;
    Ok(RedeemInviteResult { request_id })
}
