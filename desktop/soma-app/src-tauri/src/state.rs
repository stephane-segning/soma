use std::{
    fs,
    io::Write,
    sync::{Mutex, OnceLock},
};

use anyhow::{Context, Result};
use derive_builder::Builder;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Wry};

use crate::paths::{AppPaths, ensure_app_paths};

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

pub trait AppStateStore: Send + Sync + 'static {
    fn load(&self, app: &AppHandle<Wry>) -> Result<AppSnapshot>;
    fn persist_route(&self, app: &AppHandle<Wry>, route: String) -> Result<()>;
    fn persist_window(&self, app: &AppHandle<Wry>, bounds: WindowBounds) -> Result<()>;
}

pub struct FileStateStore {
    paths: OnceLock<AppPaths>,
    snapshot: Mutex<AppSnapshot>,
}

impl Default for FileStateStore {
    fn default() -> Self {
        Self {
            paths: OnceLock::new(),
            snapshot: Mutex::new(AppSnapshot::default()),
        }
    }
}

impl FileStateStore {
    fn ensure_paths(&self, app: &AppHandle<Wry>) -> Result<AppPaths> {
        ensure_app_paths(&self.paths, app)
    }

    fn load_from_disk(&self, paths: &AppPaths) -> Result<AppSnapshot> {
        if !paths.state_file().exists() {
            return Ok(AppSnapshot::default());
        }

        let data =
            fs::read(paths.state_file()).context("failed to read persisted app state file")?;
        let snapshot: AppSnapshot = serde_json::from_slice(&data)
            .context("failed to deserialize persisted app state file")?;
        let mut guard = self.snapshot.lock().expect("state mutex poisoned");
        *guard = snapshot.clone();
        Ok(snapshot)
    }

    fn write_snapshot(&self, paths: &AppPaths, snapshot: &AppSnapshot) -> Result<()> {
        let serialized = serde_json::to_vec_pretty(snapshot)
            .context("failed to serialize app state snapshot")?;
        let mut file = fs::File::create(paths.state_file())
            .context("failed to open state file for writing")?;
        file.write_all(&serialized)
            .context("failed to write app state file")?;
        file.sync_all().context("failed to sync app state file")?;
        Ok(())
    }

    fn read_or_cached_snapshot(&self, paths: &AppPaths) -> Result<AppSnapshot> {
        let cached = self.snapshot.lock().expect("state mutex poisoned").clone();
        if cached.last_route.is_some() || cached.window.is_some() {
            return Ok(cached);
        }
        self.load_from_disk(paths)
    }

    fn normalize_route(route: String) -> String {
        let trimmed = route.trim();
        if trimmed.is_empty() {
            return trimmed.to_owned();
        }
        if trimmed.starts_with('/') {
            trimmed.to_owned()
        } else {
            format!("/{}", trimmed)
        }
    }
}

impl AppStateStore for FileStateStore {
    fn load(&self, app: &AppHandle<Wry>) -> Result<AppSnapshot> {
        let paths = self.ensure_paths(app)?;
        self.read_or_cached_snapshot(&paths)
    }

    fn persist_route(&self, app: &AppHandle<Wry>, route: String) -> Result<()> {
        let paths = self.ensure_paths(app)?;
        let normalized = Self::normalize_route(route);
        let mut snapshot = self.snapshot.lock().expect("state mutex poisoned").clone();
        snapshot.last_route = Some(normalized);
        self.write_snapshot(&paths, &snapshot)?;
        let mut guard = self.snapshot.lock().expect("state mutex poisoned");
        *guard = snapshot;
        Ok(())
    }

    fn persist_window(&self, app: &AppHandle<Wry>, bounds: WindowBounds) -> Result<()> {
        let paths = self.ensure_paths(app)?;
        let mut snapshot = self.snapshot.lock().expect("state mutex poisoned").clone();
        snapshot.window = Some(bounds);
        self.write_snapshot(&paths, &snapshot)?;
        let mut guard = self.snapshot.lock().expect("state mutex poisoned");
        *guard = snapshot;
        Ok(())
    }
}

#[derive(Builder, Clone)]
pub struct ManagedState {
    pub store: std::sync::Arc<dyn AppStateStore>,
    pub daemon: std::sync::Arc<crate::daemon::DaemonApi>,
    pub agent: std::sync::Arc<crate::agent::AgentApi>,
}

impl ManagedState {
    pub fn new(
        store: std::sync::Arc<dyn AppStateStore>,
        daemon: std::sync::Arc<crate::daemon::DaemonApi>,
        agent: std::sync::Arc<crate::agent::AgentApi>,
    ) -> Self {
        Self {
            store,
            daemon,
            agent,
        }
    }
}
