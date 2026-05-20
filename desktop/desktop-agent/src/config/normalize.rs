//! Pure-function normalization of an untrusted JSON value (whatever the
//! renderer wrote into `agent.config`) into a typed
//! [`AgentRuntimeConfig`]. Mirrors `agent-config/normalizers.ts`.
//!
//! Kept dependency-free so the agent service can re-normalize on every
//! read of the underlying store without touching reqwest or tokio.

use std::collections::HashMap;

use serde_json::Value;

use super::{AgentModelCapabilities, AgentRuntimeConfig, AgentWorkspaceRuntimeConfig};
use crate::types::AgentProvider;

pub fn normalize_runtime_config(value: &Value) -> AgentRuntimeConfig {
    let defaults = AgentRuntimeConfig::default();
    let Some(map) = value.as_object() else {
        return defaults;
    };

    AgentRuntimeConfig {
        provider: provider(map.get("provider"), defaults.provider),
        open_ai_base_url: url(map.get("openAiBaseUrl"), &defaults.open_ai_base_url),
        open_ai_api_key: string(map.get("openAiApiKey"), "").trim().to_owned(),
        open_ai_chat_model: string(map.get("openAiChatModel"), &defaults.open_ai_chat_model),
        open_ai_embed_model: string(map.get("openAiEmbedModel"), &defaults.open_ai_embed_model),
        poll_interval_ms: integer(map.get("pollIntervalMs"), defaults.poll_interval_ms, 1_000, 120_000),
        request_timeout_ms: integer(map.get("requestTimeoutMs"), defaults.request_timeout_ms, 3_000, 120_000),
        model_capabilities: capabilities_map(map.get("modelCapabilities")),
        workspaces: workspaces_map(map.get("workspaces")),
    }
}

fn provider(value: Option<&Value>, fallback: AgentProvider) -> AgentProvider {
    match value.and_then(Value::as_str) {
        Some("openai-compatible") => AgentProvider::OpenAiCompatible,
        _ => fallback,
    }
}

fn string(value: Option<&Value>, fallback: &str) -> String {
    let Some(s) = value.and_then(Value::as_str) else {
        return fallback.to_owned();
    };
    let trimmed = s.trim();
    if trimmed.is_empty() {
        fallback.to_owned()
    } else {
        trimmed.to_owned()
    }
}

fn url(value: Option<&Value>, fallback: &str) -> String {
    let normalized = string(value, fallback);
    normalized.trim_end_matches('/').to_owned()
}

fn integer(value: Option<&Value>, fallback: u64, min: u64, max: u64) -> u64 {
    let Some(n) = value.and_then(Value::as_f64) else {
        return fallback;
    };
    if !n.is_finite() {
        return fallback;
    }
    (n.round() as i64).clamp(min as i64, max as i64) as u64
}

fn workspaces_map(value: Option<&Value>) -> HashMap<String, AgentWorkspaceRuntimeConfig> {
    let Some(obj) = value.and_then(Value::as_object) else {
        return HashMap::new();
    };
    obj.iter()
        .filter_map(|(k, v)| {
            let space_id = k.trim();
            if space_id.is_empty() {
                return None;
            }
            workspace(v).map(|w| (space_id.to_owned(), w))
        })
        .collect()
}

fn workspace(value: &Value) -> Option<AgentWorkspaceRuntimeConfig> {
    let obj = value.as_object()?;
    let chat_model = obj.get("chatModel").and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty()).map(str::to_owned);
    let embed_model = obj.get("embedModel").and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty()).map(str::to_owned);
    let model_capabilities = capabilities_map(obj.get("modelCapabilities"));
    if chat_model.is_none() && embed_model.is_none() && model_capabilities.is_empty() {
        return None;
    }
    Some(AgentWorkspaceRuntimeConfig {
        chat_model,
        embed_model,
        model_capabilities,
    })
}

fn capabilities_map(value: Option<&Value>) -> HashMap<String, AgentModelCapabilities> {
    let Some(obj) = value.and_then(Value::as_object) else {
        return HashMap::new();
    };
    obj.iter()
        .filter_map(|(k, v)| {
            let model = k.trim();
            if model.is_empty() {
                return None;
            }
            capabilities(v).map(|c| (model.to_owned(), c))
        })
        .collect()
}

fn capabilities(value: &Value) -> Option<AgentModelCapabilities> {
    let obj = value.as_object()?;
    let caps = AgentModelCapabilities {
        chat: obj.get("chat").and_then(Value::as_bool),
        embed: obj.get("embed").and_then(Value::as_bool),
        tool: obj.get("tool").and_then(Value::as_bool),
        image: obj.get("image").and_then(Value::as_bool),
        updated_at_ms: obj
            .get("updatedAtMs")
            .and_then(Value::as_f64)
            .filter(|n| n.is_finite() && *n >= 0.0)
            .map(|n| n.floor() as i64),
    };
    if caps.is_empty() { None } else { Some(caps) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn defaults_when_value_is_not_object() {
        let cfg = normalize_runtime_config(&json!(null));
        assert_eq!(cfg.open_ai_chat_model, AgentRuntimeConfig::default().open_ai_chat_model);
    }

    #[test]
    fn clamps_intervals() {
        let cfg = normalize_runtime_config(&json!({ "pollIntervalMs": 1 }));
        assert_eq!(cfg.poll_interval_ms, 1_000);
        let cfg = normalize_runtime_config(&json!({ "pollIntervalMs": 999_999 }));
        assert_eq!(cfg.poll_interval_ms, 120_000);
    }

    #[test]
    fn strips_trailing_slashes_on_url() {
        let cfg = normalize_runtime_config(&json!({ "openAiBaseUrl": "https://example.com///" }));
        assert_eq!(cfg.open_ai_base_url, "https://example.com");
    }

    #[test]
    fn drops_blank_workspaces() {
        let cfg = normalize_runtime_config(&json!({
            "workspaces": { "": { "chatModel": "x" }, "space-1": { "chatModel": " " } }
        }));
        assert!(cfg.workspaces.is_empty());
    }
}
