//! Practice-mode routes. Mirrors `desktop_commands::practice::*`.
//! Practice state lives in-process behind
//! `desktop_services::practice::PracticeService` — no daemon
//! round-trip — but the SDK call sites still go through this transport
//! so the renderer doesn't care whether it's talking to Tauri or HTTP.

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State,
    routing::post,
};
use desktop_api::{AppState, practice};
use serde::Deserialize;

use crate::error::ApiError;

pub(super) fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/v1/practice_list_exercises", post(practice_list_exercises))
        .route("/api/v1/practice_save_exercise", post(practice_save_exercise))
        .route("/api/v1/practice_record_session", post(practice_record_session))
        .route("/api/v1/practice_generate_exercise", post(practice_generate_exercise))
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OptionalSpaceIdBody {
    #[serde(default)]
    space_id: Option<String>,
}

async fn practice_list_exercises(
    State(app): State<Arc<AppState>>,
    Json(body): Json<OptionalSpaceIdBody>,
) -> Result<Json<Vec<practice::Exercise>>, ApiError> {
    practice::list_exercises(&app, body.space_id)
        .await
        .map(Json)
        .map_err(ApiError::from)
}

async fn practice_save_exercise(
    State(app): State<Arc<AppState>>,
    Json(args): Json<practice::ExerciseDraft>,
) -> Result<Json<practice::Exercise>, ApiError> {
    practice::save_exercise(&app, args).await.map(Json).map_err(ApiError::from)
}

async fn practice_record_session(
    State(app): State<Arc<AppState>>,
    Json(args): Json<practice::ExerciseAttempt>,
) -> Result<Json<practice::RecordSessionResponse>, ApiError> {
    practice::record_session(&app, args).await.map(Json).map_err(ApiError::from)
}

async fn practice_generate_exercise(
    State(app): State<Arc<AppState>>,
    Json(args): Json<practice::GenerateExerciseInput>,
) -> Result<Json<practice::ExerciseDraft>, ApiError> {
    practice::generate_exercise(&app, args)
        .await
        .map(Json)
        .map_err(ApiError::from)
}
