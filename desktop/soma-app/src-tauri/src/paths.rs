use std::{fs, path::PathBuf, sync::OnceLock};

use anyhow::{Context, Result};
use tauri::{AppHandle, Manager, Wry};

#[derive(Clone, Debug)]
pub struct AppPaths {
    data_dir: PathBuf,
    state_file: PathBuf,
}

impl AppPaths {
    pub fn from_app(app: &AppHandle<Wry>) -> Result<Self> {
        let data_dir = app
            .path()
            .app_data_dir()
            .context("unable to resolve app data directory")?;

        let state_file = data_dir.join("state.json");

        fs::create_dir_all(
            state_file
                .parent()
                .context("state file missing parent directory")?,
        )
        .context("failed to create state directory")?;

        Ok(Self {
            data_dir,
            state_file,
        })
    }

    pub fn state_file(&self) -> &PathBuf {
        &self.state_file
    }

    pub fn data_dir(&self) -> &PathBuf {
        &self.data_dir
    }
}

pub fn ensure_app_paths(lock: &OnceLock<AppPaths>, app: &AppHandle<Wry>) -> Result<AppPaths> {
    if let Some(paths) = lock.get() {
        return Ok(paths.clone());
    }
    let paths = AppPaths::from_app(app)?;
    let _ = lock.set(paths.clone());
    Ok(paths)
}
