//! Per-space AI provider configuration — get / set / clear for the
//! default scope and a space scope, plus blur-time validation.
//! Mirrors `soma_daemon::DaemonHandle::agent_config_*` 1:1; the Tauri
//! (and HTTP) presenters wrap each fn here as a single command.
//!
//! **The API key is write-only.** [`AgentProviderConfigView`] — the only
//! shape any handler here returns — carries `has_api_key: bool` and
//! never the value itself. [`view_from_record`] is the one place the
//! real value (on `dt::AgentProviderConfigRecord`) is touched, and it
//! collapses straight to that bool.

use desktop_agent::types::AgentProvider;
use desktop_core::error::{DesktopError, DesktopResult};
use serde::{Deserialize, Serialize};
use soma_daemon::handle_types as dt;
use specta::Type;

use crate::state::AppState;

// --- DTOs --------------------------------------------------------------------

/// Client-safe projection of one scope's AI provider config override
/// row. A field is `null` when this scope doesn't override that column
/// (it inherits — space from default, default from the compiled-in
/// constants). `poll_interval_ms` is always `null` on a space-scope
/// response (`get_space`) — only the default scope's poll interval is
/// configurable; see `set_space`'s doc comment.
#[derive(Debug, Clone, Default, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AgentProviderConfigView {
    pub provider: Option<AgentProvider>,
    pub base_url: Option<String>,
    pub has_api_key: bool,
    pub chat_model: Option<String>,
    pub embed_model: Option<String>,
    #[specta(type = Option<i32>)]
    pub request_timeout_ms: Option<u64>,
    #[specta(type = Option<i32>)]
    pub poll_interval_ms: Option<u64>,
    /// `null` when this scope has never been saved — every other field
    /// is then also `null`.
    #[specta(type = Option<i32>)]
    pub updated_at_ms: Option<i64>,
}

/// Three-state write for the one field that never round-trips in
/// cleartext (`AgentProviderConfigView` only ever exposes `hasApiKey`).
/// Defaults to `Unchanged` when omitted, so a save that isn't touching
/// the key field doesn't have to think about it.
#[derive(Debug, Clone, Default, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ApiKeyInput {
    #[default]
    Unchanged,
    Clear,
    Set {
        value: String,
    },
}

/// Whole-state overwrite for the default scope. Every field (except
/// `apiKey`, see [`ApiKeyInput`]) is a full replace: `null`/omitted
/// clears that column back to "use the compiled-in default"; the UI is
/// expected to always send the complete current form state, not a
/// sparse patch (auto-save-on-blur per ADR-0005 §3).
#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SetDefaultAgentProviderConfigArgs {
    pub provider: Option<AgentProvider>,
    pub base_url: Option<String>,
    #[serde(default)]
    pub api_key: ApiKeyInput,
    pub chat_model: Option<String>,
    pub embed_model: Option<String>,
    #[specta(type = Option<i32>)]
    pub request_timeout_ms: Option<u64>,
    #[specta(type = Option<i32>)]
    pub poll_interval_ms: Option<u64>,
}

/// Same contract as [`SetDefaultAgentProviderConfigArgs`], scoped to one
/// space — with no `pollIntervalMs` field at all: the poll interval is
/// process-wide, not overridable per space, so it isn't part of this
/// scope's writable surface.
#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SetSpaceAgentProviderConfigArgs {
    pub space_id: String,
    pub provider: Option<AgentProvider>,
    pub base_url: Option<String>,
    #[serde(default)]
    pub api_key: ApiKeyInput,
    pub chat_model: Option<String>,
    pub embed_model: Option<String>,
    #[specta(type = Option<i32>)]
    pub request_timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ValidateAgentProviderConfigArgs {
    pub base_url: String,
    /// Omitted/empty means "no Authorization header" — mirrors
    /// `OpenAiProvider::auth_header`'s trim-and-check-empty rule.
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    #[specta(type = Option<i32>)]
    pub request_timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ValidateAgentProviderConfigResult {
    pub ok: bool,
    #[specta(type = Option<i32>)]
    pub model_count: Option<usize>,
    /// Present only when `ok` is false — a human-readable reason the UI
    /// can show inline under the field (ADR-0005 §3: "errors surface
    /// inline under the field").
    pub error: Option<String>,
}

// --- Rust <-> wire provider mapping ------------------------------------------
//
// `AgentProvider` has exactly one variant today; the daemon/storage
// layers below this one are intentionally provider-agnostic and store
// it as a plain string, so this crate — the one place that knows both
// the typed enum and the plain-string boundary — owns the mapping.
//
// Delegates to `AgentProvider`'s own `Serialize`/`Deserialize`
// (`#[serde(rename_all = "kebab-case")]`, e.g. `OpenAiCompatible` ->
// `"open-ai-compatible"` — note the hyphen *inside* "open-ai", which a
// hand-written string literal got wrong once already, in the JSON
// normalizer this feature replaced) rather than hand-rolling a second
// copy of the mapping that could silently drift from the first,
// especially once a second provider variant exists.

pub(crate) fn provider_to_wire(p: AgentProvider) -> String {
    match serde_json::to_value(p) {
        Ok(serde_json::Value::String(s)) => s,
        other => unreachable!("AgentProvider always serializes to a plain string, got {other:?}"),
    }
}

pub(crate) fn provider_from_wire(raw: &str) -> Option<AgentProvider> {
    serde_json::from_value(serde_json::Value::String(raw.to_owned())).ok()
}

fn api_key_write(input: ApiKeyInput) -> dt::ApiKeyWrite {
    match input {
        ApiKeyInput::Unchanged => dt::ApiKeyWrite::Unchanged,
        ApiKeyInput::Clear => dt::ApiKeyWrite::Clear,
        ApiKeyInput::Set { value } => dt::ApiKeyWrite::Set(value),
    }
}

/// The one place `record.api_key` (the real cleartext value) is read —
/// it collapses straight to `has_api_key` and is never copied anywhere
/// else onto `AgentProviderConfigView`.
fn view_from_record(record: dt::AgentProviderConfigRecord) -> AgentProviderConfigView {
    AgentProviderConfigView {
        provider: record.provider.as_deref().and_then(provider_from_wire),
        base_url: record.base_url,
        has_api_key: record.api_key.is_some(),
        chat_model: record.chat_model,
        embed_model: record.embed_model,
        request_timeout_ms: record.request_timeout_ms.map(clamp_non_negative),
        poll_interval_ms: record.poll_interval_ms.map(clamp_non_negative),
        updated_at_ms: record.updated_at_ms,
    }
}

fn clamp_non_negative(v: i64) -> u64 {
    v.max(0) as u64
}

fn err(e: impl std::fmt::Display) -> DesktopError {
    DesktopError::Daemon {
        message: e.to_string(),
    }
}

// --- Handlers ----------------------------------------------------------------

pub async fn get_default(state: &AppState) -> DesktopResult<AgentProviderConfigView> {
    let handle = state.daemon.handle().await?;
    let record = handle.agent_config_get_default().await.map_err(err)?;
    Ok(view_from_record(record))
}

pub async fn get_space(
    state: &AppState,
    space_id: String,
) -> DesktopResult<AgentProviderConfigView> {
    let handle = state.daemon.handle().await?;
    let record = handle
        .agent_config_get_space(&space_id)
        .await
        .map_err(err)?;
    Ok(view_from_record(record))
}

pub async fn set_default(
    state: &AppState,
    args: SetDefaultAgentProviderConfigArgs,
) -> DesktopResult<AgentProviderConfigView> {
    let handle = state.daemon.handle().await?;
    let record = handle
        .agent_config_upsert_default(
            dt::UpsertAgentProviderConfigInput {
                provider: args.provider.map(provider_to_wire),
                base_url: args.base_url,
                chat_model: args.chat_model,
                embed_model: args.embed_model,
                request_timeout_ms: args.request_timeout_ms.map(|v| v as i64),
                poll_interval_ms: args.poll_interval_ms.map(|v| v as i64),
            },
            api_key_write(args.api_key),
        )
        .await
        .map_err(err)?;
    Ok(view_from_record(record))
}

pub async fn set_space(
    state: &AppState,
    args: SetSpaceAgentProviderConfigArgs,
) -> DesktopResult<AgentProviderConfigView> {
    let handle = state.daemon.handle().await?;
    let record = handle
        .agent_config_upsert_space(
            &args.space_id,
            dt::UpsertAgentProviderConfigInput {
                provider: args.provider.map(provider_to_wire),
                base_url: args.base_url,
                chat_model: args.chat_model,
                embed_model: args.embed_model,
                request_timeout_ms: args.request_timeout_ms.map(|v| v as i64),
                poll_interval_ms: None,
            },
            api_key_write(args.api_key),
        )
        .await
        .map_err(err)?;
    Ok(view_from_record(record))
}

pub async fn clear_default(state: &AppState) -> DesktopResult<bool> {
    let handle = state.daemon.handle().await?;
    handle.agent_config_clear_default().await.map_err(err)
}

pub async fn clear_space(state: &AppState, space_id: String) -> DesktopResult<bool> {
    let handle = state.daemon.handle().await?;
    handle
        .agent_config_clear_space(&space_id)
        .await
        .map_err(err)
}

pub async fn validate(
    state: &AppState,
    args: ValidateAgentProviderConfigArgs,
) -> DesktopResult<ValidateAgentProviderConfigResult> {
    if args.base_url.trim().is_empty() {
        return Ok(ValidateAgentProviderConfigResult {
            ok: false,
            model_count: None,
            error: Some("Base URL is required.".into()),
        });
    }
    match state
        .agent
        .validate_provider_config(
            &args.base_url,
            args.api_key.as_deref(),
            args.request_timeout_ms,
        )
        .await
    {
        Ok(models) => Ok(ValidateAgentProviderConfigResult {
            ok: true,
            model_count: Some(models.len()),
            error: None,
        }),
        Err(e) => Ok(ValidateAgentProviderConfigResult {
            ok: false,
            model_count: None,
            error: Some(e.to_string()),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn view_from_record_never_carries_the_api_key_value() {
        let record = dt::AgentProviderConfigRecord {
            provider: Some("open-ai-compatible".into()),
            base_url: Some("https://example.com".into()),
            api_key: Some("sk-super-secret".into()),
            chat_model: Some("gpt-x".into()),
            embed_model: None,
            request_timeout_ms: Some(15_000),
            poll_interval_ms: None,
            updated_at_ms: Some(1_000),
        };
        let view = view_from_record(record);
        assert!(view.has_api_key);
        assert_eq!(view.provider, Some(AgentProvider::OpenAiCompatible));

        // Serialize the *whole struct* and scan the JSON text — this
        // fails if any future field addition ever smuggles the value
        // through, not just the fields checked explicitly above.
        let json = serde_json::to_string(&view).expect("serialize");
        assert!(
            !json.contains("sk-super-secret"),
            "the API key value must never appear in the wire DTO: {json}"
        );
        assert!(json.contains("\"hasApiKey\":true"));
    }

    #[test]
    fn view_from_record_reports_no_key_when_none_was_ever_set() {
        let view = view_from_record(dt::AgentProviderConfigRecord::default());
        assert!(!view.has_api_key);
        assert_eq!(view.updated_at_ms, None);
    }

    #[test]
    fn provider_round_trips_through_the_wire_string() {
        assert_eq!(
            provider_from_wire(&provider_to_wire(AgentProvider::OpenAiCompatible)),
            Some(AgentProvider::OpenAiCompatible)
        );
        assert_eq!(provider_from_wire("not-a-real-provider"), None);
    }

    #[test]
    fn provider_to_wire_matches_agent_providers_own_serde_output() {
        // Pins the exact string, not just round-trip-through-itself: a
        // hand-written literal ("openai-compatible") previously drifted
        // from what `#[serde(rename_all = "kebab-case")]` actually
        // produces for `OpenAiCompatible` ("open-ai-compatible" — serde
        // treats "Open" and "Ai" as separate words). Delegating to
        // `serde_json` (see `provider_to_wire`'s doc comment) makes that
        // class of drift impossible; this test is the tripwire in case
        // the delegation is ever reverted to a hand-rolled match.
        assert_eq!(
            provider_to_wire(AgentProvider::OpenAiCompatible),
            "open-ai-compatible"
        );
    }
}
