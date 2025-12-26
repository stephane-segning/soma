use std::{
    fs,
    sync::{
        Arc, OnceLock,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, SystemTime},
};

use anyhow::{Context, Result};
use tauri::{AppHandle, Wry};
use tracing::{debug, info, warn};

use crate::paths::{AppPaths, ensure_app_paths};

pub trait Bootstrapper: Send + Sync {
    fn init(self: Arc<Self>, app: &AppHandle<Wry>) -> Result<()>;
}

pub struct MainBootstrap {
    paths: OnceLock<AppPaths>,
    maintenance_started: AtomicBool,
}

impl MainBootstrap {
    pub fn new() -> Self {
        Self {
            paths: OnceLock::new(),
            maintenance_started: AtomicBool::new(false),
        }
    }

    fn ensure_paths(&self, app: &AppHandle<Wry>) -> Result<AppPaths> {
        ensure_app_paths(&self.paths, app)
    }

    fn start_cleanup_job(&self, paths: AppPaths) {
        if self
            .maintenance_started
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return;
        }

        let staged_dir = paths.staged_blob_dir().clone();
        thread::spawn(move || {
            let interval = Duration::from_secs(60 * 60);
            let max_age = Duration::from_secs(30 * 24 * 60 * 60);
            loop {
                let _ = Self::cleanup_staged_blobs(&staged_dir, max_age);
                thread::sleep(interval);
            }
        });
    }

    fn cleanup_staged_blobs(dir: &std::path::Path, max_age: Duration) -> Result<usize> {
        let cutoff = SystemTime::now()
            .checked_sub(max_age)
            .context("failed to compute staged blob cutoff time")?;

        let mut deleted = 0usize;
        for entry in fs::read_dir(dir).context("failed to read staged blob directory")? {
            let entry = match entry {
                Ok(entry) => entry,
                Err(error) => {
                    warn!("failed to read staged blob entry: {error}");
                    continue;
                }
            };

            let path = entry.path();
            let metadata = match entry.metadata() {
                Ok(metadata) => metadata,
                Err(error) => {
                    warn!(
                        "failed to read metadata for staged blob {:?}: {error}",
                        path
                    );
                    continue;
                }
            };

            match metadata.modified() {
                Ok(modified) if modified < cutoff => match fs::remove_file(&path) {
                    Ok(_) => {
                        deleted += 1;
                        debug!("removed expired staged blob {:?}", path);
                    }
                    Err(error) => warn!("failed to delete staged blob {:?}: {error}", path),
                },
                Ok(_) => {}
                Err(error) => warn!("failed to read modified time for {:?}: {error}", path),
            }
        }

        if deleted > 0 {
            info!("cleaned up {deleted} staged blobs");
        }
        Ok(deleted)
    }
}

impl Bootstrapper for MainBootstrap {
    fn init(self: Arc<Self>, app: &AppHandle<Wry>) -> Result<()> {
        let paths = self.ensure_paths(app)?;
        info!(
            "Soma app main process starting with data dir {:?}",
            paths.data_dir()
        );
        self.start_cleanup_job(paths);
        Ok(())
    }
}
