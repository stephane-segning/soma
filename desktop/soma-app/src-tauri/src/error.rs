use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("daemon error: {0}")]
    Daemon(String),

    #[error("agent error: {0}")]
    Agent(String),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("unexpected error: {0}")]
    Other(#[from] anyhow::Error),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Serde Error: {0}")]
    JSON(#[from] serde_json::Error),
}

pub type AppResult<T> = Result<T, AppError>;

impl From<tonic::Status> for AppError {
    fn from(status: tonic::Status) -> Self {
        AppError::Daemon(status.to_string())
    }
}

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

impl From<tauri_command_utils::CommandError> for AppError {
    fn from(err: tauri_command_utils::CommandError) -> Self {
        match err {
            tauri_command_utils::CommandError::BadRequest(msg) => AppError::BadRequest(msg),
            tauri_command_utils::CommandError::Json(e) => AppError::JSON(e),
        }
    }
}
