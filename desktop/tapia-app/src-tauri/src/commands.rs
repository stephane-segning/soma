use tauri::State;

use crate::error::AppResult;
use crate::handlers::exercises::{
    BlobUpload, ExercisesController, SaveBenchmarkParams, StageExerciseParams,
};
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

#[tauri::command]
pub async fn stage_exercise(
    controller: State<'_, ExercisesController>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<BlobUpload> {
    let params: StageExerciseParams = parse_params(&request, "stage_exercise")?;
    controller.stage_exercise(params).await
}

#[tauri::command]
pub async fn record_benchmark(
    controller: State<'_, ExercisesController>,
    request: tauri::ipc::Request<'_>,
) -> AppResult<BlobUpload> {
    let params: SaveBenchmarkParams = parse_params(&request, "record_benchmark")?;
    controller.record_benchmark(params).await
}
