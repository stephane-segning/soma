use soma_core::SomaResult;
use sqlx::migrate::Migrator;
use sqlx_utils::types::Pool;

use crate::{RepositoryFactory, issuer, mailbox, membership};

/// Build an AnyPool (Postgres/SQLite) and return a repository factory.
pub async fn connect_any(
    database_url: &str,
    migrator: &'static Migrator,
) -> SomaResult<RepositoryFactory> {
    let pool = soma_core::db::DbFactory::any(database_url, migrator)
        .build_any()
        .await?;
    Ok(RepositoryFactory::new(pool))
}

/// Build a SQLite-only pool (still exposed as AnyPool) and return a repository factory.
pub async fn connect_sqlite(
    db_path: &str,
    migrator: &'static Migrator,
) -> SomaResult<RepositoryFactory> {
    let url = soma_core::db::normalize_sqlite_url(db_path);
    connect_any(&url, migrator).await
}

/// Convenience bundle returning both the pool and the concrete repos.
pub async fn connect_any_with_repos(
    database_url: &str,
    migrator: &'static Migrator,
) -> SomaResult<(
    Pool,
    membership::SqlMembershipRepository,
    issuer::SqlIssuerRepository,
    mailbox::SqlMailboxRepository,
)> {
    let factory = connect_any(database_url, migrator).await?;
    let pool = factory.pool();
    Ok((
        pool.clone(),
        factory.membership(),
        factory.issuer(),
        factory.mailbox(),
    ))
}

/// Convenience bundle returning both the pool and the concrete repos for SQLite.
pub async fn connect_sqlite_with_repos(
    db_path: &str,
    migrator: &'static Migrator,
) -> SomaResult<(
    Pool,
    membership::SqlMembershipRepository,
    issuer::SqlIssuerRepository,
    mailbox::SqlMailboxRepository,
)> {
    let factory = connect_sqlite(db_path, migrator).await?;
    let pool = factory.pool();
    Ok((
        pool.clone(),
        factory.membership(),
        factory.issuer(),
        factory.mailbox(),
    ))
}
