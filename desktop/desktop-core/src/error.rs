//! Crate-wide error type. Concrete services own their own error subtypes;
//! `DesktopError` is the lossy boundary type that ends up on the renderer
//! side of a `#[tauri::command]`.

use serde::Serialize;
use specta::Type;
use thiserror::Error;

#[derive(Debug, Error, Serialize, Type)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum DesktopError {
    #[error("io: {message}")]
    Io { message: String },
    #[error("invalid input: {message}")]
    InvalidInput { message: String },
    #[error("not found: {message}")]
    NotFound { message: String },
    #[error("daemon: {message}")]
    Daemon { message: String },
    #[error("agent: {message}")]
    Agent { message: String },
    #[error("{message}")]
    Other { message: String },
}

impl DesktopError {
    pub fn io(err: impl std::fmt::Display) -> Self {
        Self::Io {
            message: err.to_string(),
        }
    }
    pub fn invalid(err: impl std::fmt::Display) -> Self {
        Self::InvalidInput {
            message: err.to_string(),
        }
    }
    pub fn other(err: impl std::fmt::Display) -> Self {
        Self::Other {
            message: err.to_string(),
        }
    }
}

impl From<std::io::Error> for DesktopError {
    fn from(value: std::io::Error) -> Self {
        Self::Io {
            message: value.to_string(),
        }
    }
}

pub type DesktopResult<T> = Result<T, DesktopError>;
