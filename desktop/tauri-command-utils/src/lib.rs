use serde::de::DeserializeOwned;
use tauri::ipc::Request;

#[cfg(feature = "thiserror")]
use thiserror::Error;

#[cfg_attr(feature = "thiserror", derive(Error))]
#[derive(Debug)]
pub enum CommandError {
    #[cfg_attr(feature = "thiserror", error("bad request: {0}"))]
    BadRequest(String),

    #[cfg_attr(feature = "thiserror", error(transparent))]
    Json(#[from] serde_json::Error),
}

pub fn parse_params<T: DeserializeOwned>(
    request: &Request<'_>,
    command: &'static str,
) -> Result<T, CommandError> {
    let value = match request.body() {
        tauri::ipc::InvokeBody::Json(data) => data.clone(),
        _ => {
            return Err(CommandError::BadRequest(format!(
                "{command}: request body must be JSON"
            )));
        }
    };

    serde_json::from_value(value).map_err(CommandError::from)
}
