//! Runtime configuration + scope-based resolution.
//!
//! Config lives in the database (one scope-keyed row per process-wide
//! default or space — see `soma-storage`'s `agent_config` module and
//! `soma-daemon`'s `DaemonHandle::agent_config_*` methods), never in the
//! Tauri store. Resolution is three-tier: a space's overrides win, else
//! the default scope's overrides win, else [`AgentRuntimeConfig::default`]
//! (the compiled-in constants). Every overridable column is nullable at
//! each tier, meaning "inherit from the next tier down".
//!
//! Resolution happens inside the [`crate::service::ConfigSource`] on
//! every call (no caching), so config changes take effect without a
//! restart and the agent service never holds a stale snapshot.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::types::AgentProvider;

#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct AgentModelCapabilities {
    pub chat: Option<bool>,
    pub embed: Option<bool>,
    pub tool: Option<bool>,
    pub image: Option<bool>,
    #[specta(type = Option<i32>)]
    pub updated_at_ms: Option<i64>,
}

impl AgentModelCapabilities {
    pub fn is_empty(&self) -> bool {
        self.chat.is_none()
            && self.embed.is_none()
            && self.tool.is_none()
            && self.image.is_none()
            && self.updated_at_ms.is_none()
    }
}

/// Compiled-in constants: the floor every scope's overrides ultimately
/// fall back to. Also directly usable as a [`crate::service::ConfigSource`]
/// via [`crate::service::StaticConfigSource`] for tests.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AgentRuntimeConfig {
    pub provider: AgentProvider,
    pub open_ai_base_url: String,
    #[serde(default)]
    pub open_ai_api_key: String,
    pub open_ai_chat_model: String,
    pub open_ai_embed_model: String,
    #[specta(type = i32)]
    pub poll_interval_ms: u64,
    #[specta(type = i32)]
    pub request_timeout_ms: u64,
    #[serde(default)]
    pub model_capabilities: HashMap<String, AgentModelCapabilities>,
}

impl Default for AgentRuntimeConfig {
    fn default() -> Self {
        Self {
            provider: AgentProvider::OpenAiCompatible,
            open_ai_base_url: "http://127.0.0.1:11434/v1".into(),
            open_ai_api_key: String::new(),
            open_ai_chat_model: "llama3.2:1b".into(),
            open_ai_embed_model: "nomic-embed-text".into(),
            poll_interval_ms: 5_000,
            request_timeout_ms: 30_000,
            model_capabilities: HashMap::new(),
        }
    }
}

/// One scope's column overrides, exactly as persisted — `None` means
/// this scope doesn't override that column ("inherit": space -> default
/// -> [`AgentRuntimeConfig::default`]).
///
/// Internal only: carries the real `api_key` value, so this type must
/// never be serialized onto any client-facing DTO — see
/// `desktop_api::agent_config`'s view DTOs, which project it into a
/// `has_api_key: bool` and nothing else.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AgentConfigOverrides {
    pub provider: Option<AgentProvider>,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub chat_model: Option<String>,
    pub embed_model: Option<String>,
    pub request_timeout_ms: Option<u64>,
    /// Default-scope only. A space-scope override never sets this (the
    /// daemon rejects a write attempting to) — see
    /// [`resolve_workspace`]'s doc comment.
    pub poll_interval_ms: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct ResolvedWorkspaceAgentConfig {
    pub provider: AgentProvider,
    pub open_ai_base_url: String,
    pub open_ai_api_key: String,
    pub poll_interval_ms: u64,
    pub request_timeout_ms: u64,
    pub chat_model: String,
    pub embed_model: String,
    pub model_capabilities: HashMap<String, AgentModelCapabilities>,
}

/// Merge `space_overrides` (if any) over `default_overrides` over
/// `builtin` into the flat config the provider HTTP layer consumes.
/// Precedence per field: space -> default -> builtin.
///
/// `poll_interval_ms` only ever comes from `default_overrides` or
/// `builtin` — a space override is never consulted for it, matching the
/// daemon's storage contract (a space-scope row never sets that column).
///
/// `model_capabilities` is not yet scope-overridable (nothing currently
/// persists it — see the crate's `AGENTS.md`/task history); it always
/// reflects `builtin.model_capabilities`, which is empty by default.
pub fn resolve_workspace(
    builtin: &AgentRuntimeConfig,
    default_overrides: &AgentConfigOverrides,
    space_overrides: Option<&AgentConfigOverrides>,
) -> ResolvedWorkspaceAgentConfig {
    let provider = space_overrides
        .and_then(|o| o.provider)
        .or(default_overrides.provider)
        .unwrap_or(builtin.provider);

    let base_url = pick_str(space_overrides.and_then(|o| o.base_url.as_deref()))
        .or_else(|| pick_str(default_overrides.base_url.as_deref()))
        .unwrap_or_else(|| builtin.open_ai_base_url.clone());
    let base_url = base_url.trim_end_matches('/').to_owned();

    let api_key = pick_str(space_overrides.and_then(|o| o.api_key.as_deref()))
        .or_else(|| pick_str(default_overrides.api_key.as_deref()))
        .unwrap_or_else(|| builtin.open_ai_api_key.clone());

    let chat_model = pick_str(space_overrides.and_then(|o| o.chat_model.as_deref()))
        .or_else(|| pick_str(default_overrides.chat_model.as_deref()))
        .unwrap_or_else(|| builtin.open_ai_chat_model.clone());

    let embed_model = pick_str(space_overrides.and_then(|o| o.embed_model.as_deref()))
        .or_else(|| pick_str(default_overrides.embed_model.as_deref()))
        .unwrap_or_else(|| builtin.open_ai_embed_model.clone());

    let request_timeout_ms = space_overrides
        .and_then(|o| o.request_timeout_ms)
        .or(default_overrides.request_timeout_ms)
        .unwrap_or(builtin.request_timeout_ms);

    let poll_interval_ms = default_overrides.poll_interval_ms.unwrap_or(builtin.poll_interval_ms);

    ResolvedWorkspaceAgentConfig {
        provider,
        open_ai_base_url: base_url,
        open_ai_api_key: api_key,
        poll_interval_ms,
        request_timeout_ms,
        chat_model,
        embed_model,
        model_capabilities: builtin.model_capabilities.clone(),
    }
}

/// Trim + treat an empty override string as absent, so a whitespace-only
/// override doesn't shadow a real inherited value.
fn pick_str(value: Option<&str>) -> Option<String> {
    value.map(str::trim).filter(|s| !s.is_empty()).map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn overrides(mutate: impl FnOnce(&mut AgentConfigOverrides)) -> AgentConfigOverrides {
        let mut o = AgentConfigOverrides::default();
        mutate(&mut o);
        o
    }

    #[test]
    fn no_overrides_falls_back_to_builtin() {
        let builtin = AgentRuntimeConfig::default();
        let resolved = resolve_workspace(&builtin, &AgentConfigOverrides::default(), None);
        assert_eq!(resolved.chat_model, builtin.open_ai_chat_model);
        assert_eq!(resolved.open_ai_base_url, builtin.open_ai_base_url);
        assert_eq!(resolved.open_ai_api_key, "");
        assert_eq!(resolved.poll_interval_ms, builtin.poll_interval_ms);
    }

    #[test]
    fn default_scope_override_wins_over_builtin() {
        let builtin = AgentRuntimeConfig::default();
        let default_overrides = overrides(|o| o.chat_model = Some("custom-model".into()));
        let resolved = resolve_workspace(&builtin, &default_overrides, None);
        assert_eq!(resolved.chat_model, "custom-model");
    }

    #[test]
    fn space_override_wins_over_default_scope_override() {
        let builtin = AgentRuntimeConfig::default();
        let default_overrides = overrides(|o| o.chat_model = Some("default-model".into()));
        let space_overrides = overrides(|o| o.chat_model = Some("space-model".into()));
        let resolved = resolve_workspace(&builtin, &default_overrides, Some(&space_overrides));
        assert_eq!(resolved.chat_model, "space-model");
    }

    #[test]
    fn space_scope_falls_through_to_default_scope_for_unset_fields() {
        let builtin = AgentRuntimeConfig::default();
        let default_overrides = overrides(|o| {
            o.chat_model = Some("default-model".into());
            o.base_url = Some("https://default.example.com".into());
        });
        // The space overrides *only* chat_model — base_url must fall
        // through to the default scope's override, not to builtin.
        let space_overrides = overrides(|o| o.chat_model = Some("space-model".into()));
        let resolved = resolve_workspace(&builtin, &default_overrides, Some(&space_overrides));
        assert_eq!(resolved.chat_model, "space-model");
        assert_eq!(resolved.open_ai_base_url, "https://default.example.com");
    }

    #[test]
    fn full_three_tier_precedence_per_field() {
        let builtin = AgentRuntimeConfig::default();
        let default_overrides = overrides(|o| {
            o.chat_model = Some("default-model".into());
            o.embed_model = Some("default-embed".into());
        });
        let space_overrides = overrides(|o| o.chat_model = Some("space-model".into()));
        let resolved = resolve_workspace(&builtin, &default_overrides, Some(&space_overrides));
        // space wins where it sets a field
        assert_eq!(resolved.chat_model, "space-model");
        // default wins where space doesn't set a field
        assert_eq!(resolved.embed_model, "default-embed");
        // builtin wins where nothing overrides
        assert_eq!(resolved.open_ai_base_url, builtin.open_ai_base_url);
    }

    #[test]
    fn empty_or_whitespace_override_string_is_treated_as_absent() {
        let builtin = AgentRuntimeConfig::default();
        let default_overrides = overrides(|o| o.chat_model = Some("default-model".into()));
        let space_overrides = overrides(|o| o.chat_model = Some("   ".into()));
        let resolved = resolve_workspace(&builtin, &default_overrides, Some(&space_overrides));
        assert_eq!(resolved.chat_model, "default-model", "blank override must not shadow the inherited value");
    }

    #[test]
    fn trailing_slashes_are_stripped_from_the_resolved_base_url() {
        let builtin = AgentRuntimeConfig::default();
        let default_overrides = overrides(|o| o.base_url = Some("https://example.com///".into()));
        let resolved = resolve_workspace(&builtin, &default_overrides, None);
        assert_eq!(resolved.open_ai_base_url, "https://example.com");
    }

    #[test]
    fn poll_interval_ms_never_reads_a_space_override() {
        let builtin = AgentRuntimeConfig::default();
        let default_overrides = overrides(|o| o.poll_interval_ms = Some(9_000));
        // Even if a space override happened to carry a value (shouldn't
        // happen in practice — the daemon rejects writing one — but the
        // merge function itself must not read it either way).
        let space_overrides = overrides(|o| o.poll_interval_ms = Some(1_000));
        let resolved = resolve_workspace(&builtin, &default_overrides, Some(&space_overrides));
        assert_eq!(resolved.poll_interval_ms, 9_000);
    }

    #[test]
    fn absent_default_scope_row_falls_all_the_way_to_builtin_poll_interval() {
        let builtin = AgentRuntimeConfig::default();
        let resolved = resolve_workspace(&builtin, &AgentConfigOverrides::default(), None);
        assert_eq!(resolved.poll_interval_ms, builtin.poll_interval_ms);
    }
}
