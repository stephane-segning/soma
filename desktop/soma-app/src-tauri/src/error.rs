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

impl AppError {
    pub fn into_cmd_error(self) -> String {
        self.to_string()
    }
}
