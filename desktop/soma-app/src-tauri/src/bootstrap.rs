use std::{
    fs,
    sync::{Arc, OnceLock},
};

use anyhow::Result;
use tauri::{AppHandle, Wry};
use tracing::{debug, info, warn};

use crate::paths::{AppPaths, ensure_app_paths};

pub trait Bootstrapper: Send + Sync {
    fn init(self: Arc<Self>, app: &AppHandle<Wry>) -> Result<()>;
}

pub struct MainBootstrap {
    paths: OnceLock<AppPaths>,
}

impl MainBootstrap {
    pub fn new() -> Self {
        Self {
            paths: OnceLock::new(),
        }
    }

    fn ensure_paths(&self, app: &AppHandle<Wry>) -> Result<AppPaths> {
        ensure_app_paths(&self.paths, app)
    }

    fn cleanup_legacy_staged_dir(&self, paths: &AppPaths) {
        let staged_dir = paths.data_dir().join("blobs").join("staged");
        if staged_dir.exists() {
            match fs::remove_dir_all(&staged_dir) {
                Ok(_) => debug!("removed legacy staged blob directory {:?}", staged_dir),
                Err(error) => warn!(
                    "failed to remove legacy staged blob directory {:?}: {error}",
                    staged_dir
                ),
            }
        }
    }
}

impl Bootstrapper for MainBootstrap {
    fn init(self: Arc<Self>, app: &AppHandle<Wry>) -> Result<()> {
        let paths = self.ensure_paths(app)?;
        self.cleanup_legacy_staged_dir(&paths);
        info!(
            "Soma app main process starting with data dir {:?}",
            paths.data_dir()
        );
        Ok(())
    }
}
