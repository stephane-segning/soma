use std::error::Error as StdError;

use thiserror::Error;

/// Crate-wide error type to simplify error handling across bins and crates.
#[derive(Debug, Error)]
pub enum Error {
    #[error(transparent)]
    Anyhow(#[from] anyhow::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("task join error: {0}")]
    Join(#[from] tokio::task::JoinError),
    #[error("service error: {0}")]
    Service(#[source] Box<dyn StdError + Send + Sync>),
    #[error("http serve error: {0}")]
    Http(#[source] Box<dyn StdError + Send + Sync>),
}

impl Error {
    pub fn service<E>(err: E) -> Self
    where
        E: Into<Box<dyn StdError + Send + Sync>>,
    {
        Error::Service(err.into())
    }

    pub fn http<E>(err: E) -> Self
    where
        E: Into<Box<dyn StdError + Send + Sync>>,
    {
        Error::Http(err.into())
    }
}

/// Crate-wide result alias.
pub type SomaResult<T> = std::result::Result<T, Error>;
