//! Tauri presenter for `desktop_api::practice::*`.

use desktop_api::{
    AppState,
    practice::{self as api, Exercise, ExerciseAttempt, ExerciseDraft, GenerateExerciseInput, RecordSessionResponse},
};
use desktop_core::error::DesktopResult;
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn practice_list_exercises(
    state: State<'_, AppState>,
    space_id: Option<String>,
) -> DesktopResult<Vec<Exercise>> {
    api::list_exercises(state.inner(), space_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn practice_save_exercise(state: State<'_, AppState>, args: ExerciseDraft) -> DesktopResult<Exercise> {
    api::save_exercise(state.inner(), args).await
}

#[tauri::command]
#[specta::specta]
pub async fn practice_record_session(
    state: State<'_, AppState>,
    args: ExerciseAttempt,
) -> DesktopResult<RecordSessionResponse> {
    api::record_session(state.inner(), args).await
}

#[tauri::command]
#[specta::specta]
pub async fn practice_generate_exercise(
    state: State<'_, AppState>,
    args: GenerateExerciseInput,
) -> DesktopResult<ExerciseDraft> {
    api::generate_exercise(state.inner(), args).await
}
