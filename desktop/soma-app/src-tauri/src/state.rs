use derive_builder::Builder;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Builder, Clone, Debug, Serialize, Deserialize, Default)]
pub struct WindowBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Builder, Clone, Debug, Serialize, Deserialize, Default)]
pub struct AppSnapshot {
    pub last_route: Option<String>,
    pub window: Option<WindowBounds>,
}

#[derive(Builder, Clone)]
pub struct ManagedState {
    pub daemon: Arc<crate::daemon::DaemonApi>,
    pub agent: Arc<crate::agent::AgentApi>,
}

impl ManagedState {
    pub fn new(daemon: Arc<crate::daemon::DaemonApi>, agent: Arc<crate::agent::AgentApi>) -> Self {
        Self { daemon, agent }
    }
}
