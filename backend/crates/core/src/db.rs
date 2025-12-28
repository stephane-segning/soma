use std::path::Path;
use log::{error, info};
use crate::{Error, SomaResult};

#[derive(Clone, Copy, Debug)]
enum DbKind {
    Any,
    Sqlite,
}

/// Builder/factory for constructing database pools with migrations.
#[derive(Clone, Debug)]
pub struct DbFactory<'m> {
    url: String,
    max_connections: u32,
    migrator: &'m sqlx::migrate::Migrator,
    kind: DbKind,
}

impl<'m> DbFactory<'m> {
    pub fn any(url: impl Into<String>, migrator: &'m sqlx::migrate::Migrator) -> Self {
        Self {
            url: url.into(),
            max_connections: 5,
            migrator,
            kind: DbKind::Any,
        }
    }

    pub fn sqlite(path: impl Into<String>, migrator: &'m sqlx::migrate::Migrator) -> Self {
        Self {
            url: normalize_sqlite_url(path.into().as_str()),
            max_connections: 5,
            migrator,
            kind: DbKind::Sqlite,
        }
    }

    pub fn max_connections(mut self, max: u32) -> Self {
        self.max_connections = max;
        self
    }

    pub async fn build_any(self) -> SomaResult<sqlx::AnyPool> {
        if !matches!(self.kind, DbKind::Any) {
            return Err(Error::service(
                "DbFactory::build_any called on sqlite factory",
            ));
        }
        install_any_drivers();
        prepare_sqlite_path(&self.url)?;
        let pool = sqlx::any::AnyPoolOptions::new()
            .max_connections(self.max_connections)
            .connect(&self.url)
            .await
            .map_err(Error::service)?;

        self.migrator.run(&pool).await.map_err(Error::service)?;
        Ok(pool)
    }

    pub async fn build_sqlite(self) -> SomaResult<sqlx::SqlitePool> {
        if !matches!(self.kind, DbKind::Sqlite) {
            return Err(Error::service(
                "DbFactory::build_sqlite called on non-sqlite factory",
            ));
        }
        prepare_sqlite_path(&self.url)?;
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(self.max_connections)
            .connect(&self.url)
            .await
            .map_err(Error::service)?;

        self.migrator.run(&pool).await.map_err(Error::service)?;
        Ok(pool)
    }
}

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
    DbFactory::any(database_url, migrator).build_any().await
}

/// Connect using a SqlitePool and run the provided migrator.
pub async fn connect_sqlite_and_migrate(
    db_path: &str,
    migrator: &'static sqlx::migrate::Migrator,
) -> SomaResult<sqlx::SqlitePool> {
    DbFactory::sqlite(db_path, migrator).build_sqlite().await
}
