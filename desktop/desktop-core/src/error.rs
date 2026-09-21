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
    /// Caller did not present a valid credential. Maps to HTTP 401 at the
    /// BFF boundary (`desktop-bff::error::ApiError::status`). The Tauri
    /// presenter never produces this variant — the in-process command
    /// surface has no network boundary to authenticate across.
    #[error("unauthenticated: {message}")]
    Unauthenticated { message: String },
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
    pub fn unauthenticated(err: impl std::fmt::Display) -> Self {
        Self::Unauthenticated {
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
