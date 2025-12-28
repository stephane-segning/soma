use serde::de::DeserializeOwned;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::handlers::greeting::{GreetParams, GreetingController};

fn parse_params<T: DeserializeOwned>(
    request: &tauri::ipc::Request<'_>,
    command: &'static str,
) -> AppResult<T> {
    let value = match request.body() {
        tauri::ipc::InvokeBody::Json(data) => data.clone(),
        _ => {
            return Err(AppError::BadRequest(format!(
                "{command}: request body must be JSON"
            )));
        }
    };

    serde_json::from_value(value).map_err(AppError::from)
}

#[tauri::command]
pub async fn greet(
    controller: State<'_, GreetingController>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<String> {
    let params: GreetParams = parse_params(&request, "greet")?;
    controller.greet(params)
}
