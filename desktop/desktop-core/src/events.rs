//! Event payload constants for the renderer ↔ main IPC surface.
//!
//! These match the channel names previously used by the Electron preload
//! bridge (`window.api.onDomainEvent` / `onAgentEvent` / `app:deep-link`).
//! The actual payload shapes are owned by the daemon/agent crates and the
//! `@soma/desktop-db` TS package — we keep them as `serde_json::Value` here
//! so the desktop-core crate stays free of soma-daemon transitive deps.

pub const DOMAIN_EVENT: &str = "domain_event";
pub const AGENT_EVENT: &str = "agent_event";
pub const DEEP_LINK_EVENT: &str = "app:deep-link";
