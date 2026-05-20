//! In-process agent runtime + chat/embed/rerank client.
//!
//! Replaces the agent half of `addon-runtime.ts` plus `agent-client.ts`,
//! `agent-config.ts`, and `agent-client/openai.ts`. Composed from small,
//! single-responsibility pieces:
//!
//! * [`config`] — runtime config types + normalization (pure functions)
//! * [`provider`] — `ChatProvider` trait + OpenAI-compatible impl
//! * [`tasks`] — `TaskStore` trait + in-memory implementation
//! * [`events`] — runtime event polling stream
//! * [`runtime`] — owns the in-process `soma-agentd` handle
//! * [`service`] — `AgentService` coordinator wired by the desktop binary

pub mod config;
pub mod events;
pub mod provider;
pub mod runtime;
pub mod service;
pub mod tasks;
pub mod types;

pub use config::{AgentRuntimeConfig, ResolvedWorkspaceAgentConfig, normalize_runtime_config, resolve_workspace};
pub use provider::{ChatProvider, openai::OpenAiProvider};
pub use service::AgentService;
pub use tasks::{InMemoryTaskStore, TaskStore};
pub use types::*;
