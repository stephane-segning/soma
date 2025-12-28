#![deny(missing_docs)]
//! Small helpers for Tauri command plumbing (manual param parsing + shared errors).

use serde::de::DeserializeOwned;
use tauri::ipc::Request;

#[cfg(feature = "thiserror")]
use thiserror::Error;

#[cfg(not(any(feature = "bad-request", feature = "json-error")))]
compile_error!(
    "Enable at least one of `bad-request` or `json-error` features for tauri-command-utils."
);

/// Shared application error type for Tauri commands.
#[cfg_attr(feature = "thiserror", derive(Error))]
#[derive(Debug)]
pub enum AppError {
    /// Daemon/IPC error message.
    #[cfg(feature = "daemon")]
    #[cfg_attr(feature = "thiserror", error("daemon error: {0}"))]
    Daemon(String),

    /// Agent/IPC error message.
    #[cfg(feature = "agent")]
    #[cfg_attr(feature = "thiserror", error("agent error: {0}"))]
    Agent(String),

    /// IO failures.
    #[cfg(feature = "io")]
    #[cfg_attr(feature = "thiserror", error("io error: {0}"))]
    Io(#[from] std::io::Error),

    /// Catch-all error with context.
    #[cfg(feature = "anyhow")]
    #[cfg_attr(feature = "thiserror", error("unexpected error: {0}"))]
    Other(#[from] anyhow::Error),

    /// Bad request payloads.
    #[cfg(feature = "bad-request")]
    #[cfg_attr(feature = "thiserror", error("Bad request: {0}"))]
    BadRequest(String),

    /// JSON serialization/deserialization failures.
    #[cfg(feature = "json-error")]
    #[cfg_attr(feature = "thiserror", error("Serde Error: {0}"))]
    Json(#[from] serde_json::Error),
}

/// Result alias for application commands.
pub type AppResult<T> = Result<T, AppError>;

/// Parse a Tauri `Request` body into strongly-typed params.
pub fn parse_params<T: DeserializeOwned>(
    request: &Request<'_>,
    command: &'static str,
) -> AppResult<T> {
    let value = match request.body() {
        tauri::ipc::InvokeBody::Json(data) => data.clone(),
        _ => return Err(bad_request(format!("{command}: request body must be JSON"))),
    };

    serde_json::from_value(value).map_err(AppError::from)
}

#[cfg(feature = "bad-request")]
fn bad_request(msg: String) -> AppError {
    AppError::BadRequest(msg)
}

#[cfg(all(feature = "json-error", not(feature = "bad-request")))]
fn bad_request(msg: String) -> AppError {
    // Fallback to JSON error when BadRequest variant is disabled.
    AppError::Json(serde_json::Error::custom(msg))
}

#[cfg(feature = "daemon")]
impl From<tonic::Status> for AppError {
    fn from(status: tonic::Status) -> Self {
        AppError::Daemon(status.to_string())
    }
}

#[cfg(feature = "daemon")]
impl From<tonic::transport::Error> for AppError {
    fn from(err: tonic::transport::Error) -> Self {
        AppError::Daemon(err.to_string())
    }
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

#[cfg(not(feature = "thiserror"))]
impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            #[cfg(feature = "daemon")]
            AppError::Daemon(msg) => write!(f, "daemon error: {msg}"),
            #[cfg(feature = "agent")]
            AppError::Agent(msg) => write!(f, "agent error: {msg}"),
            #[cfg(feature = "io")]
            AppError::Io(e) => write!(f, "io error: {e}"),
            #[cfg(feature = "anyhow")]
            AppError::Other(e) => write!(f, "unexpected error: {e}"),
            #[cfg(feature = "bad-request")]
            AppError::BadRequest(msg) => write!(f, "Bad request: {msg}"),
            #[cfg(feature = "json-error")]
            AppError::Json(e) => write!(f, "Serde Error: {e}"),
        }
    }
}

#[cfg(not(feature = "thiserror"))]
impl std::error::Error for AppError {}
