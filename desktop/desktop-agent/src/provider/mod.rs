//! Provider abstraction: callers ask for chat / model list / embeddings
//! through this trait without caring whether the backend is an
//! OpenAI-compatible HTTP endpoint, Ollama-native, or a future in-process
//! engine. Mirrors the role of `agent-client/openai.ts` but inverted so we
//! can add additional providers without touching the agent service.
//!
//! The trait keeps the surface small (interface segregation): callers that
//! need only chat don't pay for an embedder, and vice versa via the
//! `_supported` defaults.

pub mod openai;

use async_trait::async_trait;
use desktop_core::error::DesktopResult;

use crate::types::{AgentModel, ChatMessage, ChatOptions, ChatResponse};

#[async_trait]
pub trait ChatProvider: Send + Sync {
    /// Best-effort single-shot completion. The TS implementation already
    /// collapsed streaming into a single response; we keep that shape and
    /// add real streaming later as an additive method.
    async fn chat(&self, messages: &[ChatMessage], opts: &ChatOptions) -> DesktopResult<ChatResponse>;

    async fn list_models(&self) -> DesktopResult<Vec<AgentModel>>;

    /// Returns one embedding per input text. Length **must** match `texts.len()`;
    /// providers that can't fulfil a particular row return an empty vector
    /// in that slot (cosine similarity handles that gracefully).
    async fn embed(&self, model: &str, texts: &[&str]) -> DesktopResult<Vec<Vec<f32>>>;
}
