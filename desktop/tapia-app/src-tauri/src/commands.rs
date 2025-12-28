use tauri::State;

use crate::error::AppResult;
use crate::handlers::greeting::{GreetParams, GreetingController};
use tauri_command_utils::parse_params;

#[tauri::command]
pub async fn greet(
    controller: State<'_, GreetingController>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<String> {
    let params: GreetParams = parse_params(&request, "greet")?;
    controller.greet(params)
}
