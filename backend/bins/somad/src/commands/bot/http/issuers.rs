use std::{sync::Arc, time::SystemTime};

use axum::{Json, extract::State, http::StatusCode};
use base64::Engine;
use base64::engine::general_purpose::STANDARD as B64;
use libp2p::PeerId;
use prost::Message;
use serde::Deserialize;
use soma_membership::{
    bot_status, issue_issuer_capability_to_storage, parse_role_str,
    scopes::SCOPE_ISSUE_MEMBERSHIP,
};
use soma_proto_build::space::SpaceRole;
use soma_storage::issuer::IssuerRepository;

use super::{BotState, JsonResult, auth::authorize};

#[derive(Deserialize)]
pub(super) struct IssueIssuerCapPayload {
    admin_token: Option<String>,
    space_id: String,
    delegate_peer_id: String,
    allowed_roles: Option<Vec<String>>,
    expires_at_secs: Option<i64>,
}

#[derive(Deserialize)]
pub(super) struct ImportIssuerCapPayload {
    admin_token: Option<String>,
    space_id: String,
    delegate_peer_id: String,
    issuer_peer_id: String,
    expires_at_secs: Option<i64>,
    capability_b64: String,
}

pub(super) async fn issue_handler(
    State(state): State<Arc<BotState>>,
    payload: Json<IssueIssuerCapPayload>,
    admin_token: Option<String>,
) -> JsonResult {
    authorize(&admin_token, payload.admin_token.clone())?;

    let owner_peer_id = parse_peer_id(
        &state.info.peer_id,
        StatusCode::INTERNAL_SERVER_ERROR,
        "invalid bot peer_id",
    )?;
    let delegate_peer_id = parse_peer_id(
        &payload.delegate_peer_id,
        StatusCode::BAD_REQUEST,
        "invalid delegate_peer_id",
    )?;
    let allowed_roles: Vec<SpaceRole> = payload
        .allowed_roles
        .clone()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|s| parse_role_str(&s))
        .collect();

    let issuer_cap = issue_issuer_capability_to_storage(
        &state.repos,
        &state.signer,
        &owner_peer_id,
        &payload.space_id,
        &delegate_peer_id,
        allowed_roles,
        payload.expires_at_secs,
        // somad's HTTP issuer endpoint is a server-to-server path used by
        // bot hosts to register capabilities programmatically. There's no
        // operator-typed alias here — the renderer's Bots tab is the only
        // surface that captures one. Pass None and let the row carry a
        // null alias in storage.
        None,
        // No libp2p handshake on this path — the caller asserts the
        // capability is already trusted, so persist as `active`
        // directly. Matches the existing import_handler behaviour.
        bot_status::ACTIVE,
        // Deny-by-default scope handling. The HTTP request payload does
        // not currently expose a `scopes` field, but writing `Vec::new()`
        // here interacts badly with the local "empty scopes = allow"
        // backward-compat rule in `ensure_can_issue_membership` /
        // `check_issue_membership_scope`: any capability registered over
        // this server-to-server path would implicitly receive all
        // scopes. Default to the single scope this endpoint actually
        // needs (`issue:membership`) so the row carries an explicit
        // grant. Widening this should be a deliberate change with a
        // matching payload field.
        default_http_issuer_scopes(),
    )
    .await
    .map_err(internal_error("failed to issue issuer capability"))?;

    Ok(Json(serde_json::json!({
        "space_id": payload.space_id,
        "delegate_peer_id": payload.delegate_peer_id,
        "capability_b64": B64.encode(Message::encode_to_vec(&issuer_cap)),
    })))
}

pub(super) async fn import_handler(
    State(state): State<Arc<BotState>>,
    payload: Json<ImportIssuerCapPayload>,
    admin_token: Option<String>,
) -> JsonResult {
    authorize(&admin_token, payload.admin_token.clone())?;

    let bytes = B64.decode(payload.capability_b64.as_bytes()).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "invalid capability_b64"})),
        )
    })?;

    state
        .repos
        .issuer()
        .upsert(&soma_storage::issuer::IssuerCapability {
            space_id: payload.space_id.clone(),
            issuer_peer_id: payload.issuer_peer_id.clone(),
            delegate_peer_id: payload.delegate_peer_id.clone(),
            issued_at: now_secs(),
            expires_at: payload.expires_at_secs,
            capability: Some(bytes),
            // Imported capabilities carry no operator-typed alias.
            alias: None,
            // Imports come in fully formed — treat as `active` (the
            // caller asserts the capability is already valid).
            status: bot_status::ACTIVE.to_string(),
            // Deny-by-default scope handling. Same rationale as
            // `issue_handler` above: persisting `Vec::new()` would
            // collide with the "empty scopes = allow" backward-compat
            // rule and implicitly grant every scope. Imports flow only
            // through the membership-issuance flow today, so default to
            // an explicit `issue:membership` grant.
            scopes: default_http_issuer_scopes(),
        })
        .await
        .map_err(internal_error("failed to import issuer capability"))?;

    Ok(Json(serde_json::json!({"ok": true})))
}

fn parse_peer_id(
    value: &str,
    status: StatusCode,
    error: &'static str,
) -> Result<PeerId, (StatusCode, Json<serde_json::Value>)> {
    value
        .parse()
        .map_err(|_| (status, Json(serde_json::json!({"error": error}))))
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn internal_error<E: std::fmt::Display>(
    context: &'static str,
) -> impl FnOnce(E) -> (StatusCode, Json<serde_json::Value>) {
    move |err| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": format!("{context}: {err}")})),
        )
    }
}

/// The deny-by-default scope vec that both `issue_handler` and
/// `import_handler` write to the stored `issuer_capabilities.scopes`
/// column.
///
/// The HTTP request payloads on these two endpoints do **not** currently
/// expose a `scopes` field — bot hosts call them server-to-server with
/// the assumption that the daemon will pick a sensible default. Before
/// this fix the default was `Vec::new()`, which, in combination with the
/// "empty scopes = allow" backward-compat rule in
/// `membership::ensure_can_issue_membership`, meant every capability
/// brought in over either endpoint implicitly received every scope.
///
/// The deny-by-default fix is to write the single scope these endpoints
/// actually need (`issue:membership`). If the surface area grows to need
/// additional scopes, expose them via the payload rather than widening
/// this default.
fn default_http_issuer_scopes() -> Vec<String> {
    vec![SCOPE_ISSUE_MEMBERSHIP.to_string()]
}

#[cfg(test)]
mod tests {
    //! Regression tests for the somad HTTP scope-enforcement bypass
    //! (#98). Both `issue_handler` and `import_handler` used to
    //! hardcode `scopes = Vec::new()`, which combined with the
    //! backward-compat "empty = allow" rule to grant every scope
    //! implicitly. The fix is to write an explicit
    //! `vec!["issue:membership"]` via `default_http_issuer_scopes()`.
    //!
    //! Spinning up `BotState` + `RepositoryFactory` for a full
    //! handler-level integration test is heavyweight relative to the
    //! bug, which is a literal vec-value choice. We instead assert on
    //! the shared helper that both handlers route through, so any
    //! future regression that resets the default to `Vec::new()` (or
    //! drops the explicit scope) will fail here.
    use super::*;

    #[test]
    fn default_scopes_are_non_empty() {
        assert!(
            !default_http_issuer_scopes().is_empty(),
            "deny-by-default: somad HTTP issuer endpoints must never \
             persist an empty scopes vec — the backward-compat rule \
             treats empty as 'allow all'"
        );
    }

    #[test]
    fn default_scopes_grant_issue_membership() {
        let scopes = default_http_issuer_scopes();
        assert!(
            scopes.iter().any(|s| s == SCOPE_ISSUE_MEMBERSHIP),
            "somad HTTP issuer endpoints must grant the explicit \
             'issue:membership' scope by default; got {scopes:?}"
        );
    }

    #[test]
    fn default_scopes_only_contain_issue_membership() {
        // Pin the default to a single scope so any future widening
        // (e.g. adding 'admin:kick') has to be a deliberate edit
        // with reviewer attention.
        let scopes = default_http_issuer_scopes();
        assert_eq!(
            scopes,
            vec![SCOPE_ISSUE_MEMBERSHIP.to_string()],
            "widening the default-scopes set must be deliberate"
        );
    }
}
