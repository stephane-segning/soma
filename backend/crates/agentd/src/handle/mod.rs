//! In-process handle to a running agent runtime.
//!
//! Plain Rust types only — no proto, no tonic. The napi-rs addon and any other
//! Rust embedder call into the agent through this surface.

use soma_core::Error;

use crate::engine::EngineHandle;

pub mod types;

mod drift;
mod rerank;
mod status;

/// Build a validation error.
pub(crate) fn invalid(msg: impl Into<String>) -> Error {
    Error::service(msg.into())
}

/// Cloneable in-process handle to the agent runtime.
#[derive(Clone)]
pub struct AgentHandle {
    pub(crate) engine: EngineHandle,
}

impl AgentHandle {
    pub(crate) fn new(engine: EngineHandle) -> Self {
        Self { engine }
    }
}
