use std::{
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::Context;

pub(super) fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u128::from(u64::MAX)) as u64
}

pub(super) async fn prepare_db_path(path: &Path) -> anyhow::Result<()> {
    let parent: Option<PathBuf> = path.parent().map(Path::to_path_buf);
    if let Some(parent_dir) = parent {
        tokio::fs::create_dir_all(&parent_dir)
            .await
            .with_context(|| format!("failed to create db dir: {}", parent_dir.display()))?;
    }

    tokio::fs::OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .open(path)
        .await
        .with_context(|| format!("failed to open/create sqlite db file: {}", path.display()))?;

    Ok(())
}
