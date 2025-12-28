use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Serde Error: {0}")]
    JSON(#[from] serde_json::Error),

    #[error("Unexpected error: {0}")]
    Other(String),
}

pub type AppResult<T> = Result<T, AppError>;

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
