use std::{sync::Arc, time::SystemTime};

use serde::{Deserialize, Serialize};

use crate::{
    daemon::DaemonApi,
    error::{AppError, AppResult},
};

#[derive(Clone)]
pub struct ExercisesController {
    daemon: Arc<DaemonApi>,
}

impl ExercisesController {
    pub fn new(daemon: Arc<DaemonApi>) -> Self {
        Self { daemon }
    }

    pub async fn stage_exercise(&self, params: StageExerciseParams) -> AppResult<BlobUpload> {
        if params.space_id.is_empty() {
            return Err(AppError::BadRequest("spaceId is required".into()));
        }
        if params.exercise_id.is_empty() {
            return Err(AppError::BadRequest("exerciseId is required".into()));
        }
        if params.text.trim().is_empty() {
            return Err(AppError::BadRequest("exercise text is required".into()));
        }

        let payload = ExerciseBlob {
            exercise_id: params.exercise_id.clone(),
            space_id: params.space_id.clone(),
            text: params.text.clone(),
            topic: params.topic.clone(),
            difficulty: params.difficulty.clone(),
            source: params.source.clone().or(Some("deep-link".to_string())),
            source_host: params.source_host.clone(),
            source_link: params.source_link.clone(),
            tags: params.tags.clone(),
            length: params.text.chars().count(),
            ingested_at_ms: now_ms(),
        };

        let data = serde_json::to_vec(&payload)?;
        let response = self
            .daemon
            .upload_blob(soma_proto_build::daemon::UploadBlobRequest {
                space_id: params.space_id.clone(),
                data,
                mime: "application/json".to_string(),
                name: format!("tapia-exercise-{}.json", params.exercise_id),
                doc_id: String::new(),
            })
            .await?;

        Ok(BlobUpload::from(response))
    }

    pub async fn record_benchmark(&self, params: SaveBenchmarkParams) -> AppResult<BlobUpload> {
        if params.space_id.is_empty() {
            return Err(AppError::BadRequest("spaceId is required".into()));
        }
        if params.exercise_id.is_empty() {
            return Err(AppError::BadRequest("exerciseId is required".into()));
        }
        if params.wpm.is_nan() || params.wpm.is_sign_negative() {
            return Err(AppError::BadRequest("wpm must be non-negative".into()));
        }
        if params.accuracy.is_nan() || params.accuracy < 0.0 {
            return Err(AppError::BadRequest("accuracy must be >= 0".into()));
        }

        let payload = ExerciseBenchmark {
            exercise_id: params.exercise_id.clone(),
            space_id: params.space_id.clone(),
            exercise_cid: params.exercise_cid.clone(),
            wpm: params.wpm,
            accuracy: params.accuracy,
            duration_ms: params.duration_ms,
            completed_at_ms: params.completed_at_ms,
            source_host: params.source_host.clone(),
            source_link: params.source_link.clone(),
            recorded_at_ms: now_ms(),
        };

        let data = serde_json::to_vec(&payload)?;
        let response = self
            .daemon
            .upload_blob(soma_proto_build::daemon::UploadBlobRequest {
                space_id: params.space_id.clone(),
                data,
                mime: "application/json".to_string(),
                name: format!("tapia-benchmark-{}.json", params.exercise_id),
                doc_id: String::new(),
            })
            .await?;

        Ok(BlobUpload::from(response))
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageExerciseParams {
    pub space_id: String,
    pub exercise_id: String,
    pub text: String,
    pub topic: Option<String>,
    pub difficulty: Option<String>,
    pub source: Option<String>,
    pub source_host: Option<String>,
    pub source_link: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveBenchmarkParams {
    pub space_id: String,
    pub exercise_id: String,
    pub exercise_cid: Option<String>,
    pub wpm: f64,
    pub accuracy: f64,
    pub duration_ms: u64,
    pub completed_at_ms: u64,
    pub source_host: Option<String>,
    pub source_link: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlobUpload {
    pub cid: String,
    pub size: u64,
    pub mime: String,
    pub name: String,
}

impl From<soma_proto_build::daemon::UploadBlobResponse> for BlobUpload {
    fn from(value: soma_proto_build::daemon::UploadBlobResponse) -> Self {
        Self {
            cid: value.cid,
            size: value.size,
            mime: value.mime,
            name: value.name,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExerciseBlob {
    exercise_id: String,
    space_id: String,
    text: String,
    topic: Option<String>,
    difficulty: Option<String>,
    source: Option<String>,
    source_host: Option<String>,
    source_link: Option<String>,
    tags: Option<Vec<String>>,
    length: usize,
    ingested_at_ms: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExerciseBenchmark {
    exercise_id: String,
    space_id: String,
    exercise_cid: Option<String>,
    wpm: f64,
    accuracy: f64,
    duration_ms: u64,
    completed_at_ms: u64,
    source_host: Option<String>,
    source_link: Option<String>,
    recorded_at_ms: i64,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}
