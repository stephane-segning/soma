//! In-process handle to a running agent daemon.
//!
//! This is the parallel surface to [`crate::grpc`]: same underlying engine and
//! task store, but plain Rust types only (no proto, no tonic). The napi-rs
//! addon and pure-Rust embedders call this surface; the gRPC service stays as
//! the binary's Unix-socket interface and is not affected.

use soma_core::Error;

use crate::{engine::EngineHandle, tasks::BackgroundTaskStore};

pub mod types;

mod drift;
mod rerank;
mod status;

/// Build a validation error.
pub(crate) fn invalid(msg: impl Into<String>) -> Error {
    Error::service(msg.into())
}

/// Cloneable in-process handle to the agent runtime. Holds clones of the
/// engine and background task store; methods on the handle delegate to those
/// directly rather than going through gRPC.
#[derive(Clone)]
pub struct AgentHandle {
    pub(crate) engine: EngineHandle,
    #[allow(dead_code)]
    pub(crate) task_store: BackgroundTaskStore,
}

impl AgentHandle {
    pub(crate) fn new(engine: EngineHandle, task_store: BackgroundTaskStore) -> Self {
        Self {
            engine,
            task_store,
        }
    }
}
