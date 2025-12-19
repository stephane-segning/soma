use std::path::Path;

use crate::{Error, SomaResult};

/// Register SQLx Any drivers (Postgres + SQLite). Call once before opening an AnyPool.
pub fn install_any_drivers() {
    sqlx::any::install_default_drivers();
}

/// Normalize a SQLite path into a URL (`sqlite://`), leaving other URLs intact.
pub fn normalize_sqlite_url(input: &str) -> String {
    if input.starts_with("sqlite:") {
        input.to_string()
    } else {
        let path = Path::new(input);
        format!("sqlite://{}", path.to_string_lossy())
    }
}

/// Ensure the filesystem path for a SQLite URL exists and create the file if missing.
pub fn prepare_sqlite_path(url: &str) -> SomaResult<()> {
    if let Some(stripped) = url.strip_prefix("sqlite://") {
        let path = Path::new(stripped);
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent).map_err(Error::Io)?;
            }
        }
        // Touch the file to surface permissions issues early.
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .read(true)
            .open(path)
            .map_err(Error::Io)?;
    }
    Ok(())
}

/// Connect using AnyPool and run the provided migrator.
pub async fn connect_any_and_migrate(
    database_url: &str,
    migrator: &'static sqlx::migrate::Migrator,
) -> SomaResult<sqlx::AnyPool> {
    install_any_drivers();
    let url = if database_url.starts_with("postgres://") || database_url.starts_with("postgresql://")
    {
        database_url.to_string()
    } else {
        normalize_sqlite_url(database_url)
    };
    prepare_sqlite_path(&url)?;

    let pool = sqlx::any::AnyPoolOptions::new()
        .max_connections(5)
        .connect(&url)
        .await
        .map_err(Error::service)?;

    migrator.run(&pool).await.map_err(Error::service)?;
    Ok(pool)
}

/// Connect using a SqlitePool and run the provided migrator.
pub async fn connect_sqlite_and_migrate(
    db_path: &str,
    migrator: &'static sqlx::migrate::Migrator,
) -> SomaResult<sqlx::SqlitePool> {
    let url = normalize_sqlite_url(db_path);
    prepare_sqlite_path(&url)?;

    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&url)
        .await
        .map_err(Error::service)?;

    migrator.run(&pool).await.map_err(Error::service)?;
    Ok(pool)
}
