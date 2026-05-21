//! Practice-mode handlers. No daemon backing — practice is in-process
//! state managed by [`desktop_services::practice::PracticeService`].
//!
//! Wire DTOs match `@shared/practice` field-by-field (camelCase, optional
//! fields stay optional) so the renderer can keep its existing call
//! sites. Numeric millisecond fields are emitted as `i32` for the SDK
//! since specta-typescript currently lacks bigint support; this matches
//! the rest of the desktop-api conventions.

use desktop_core::error::DesktopResult;
use desktop_services::practice as svc;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::state::AppState;

// --- Enums -------------------------------------------------------------------

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExerciseDifficulty {
    Beginner,
    Intermediate,
    Advanced,
}

impl From<ExerciseDifficulty> for svc::ExerciseDifficulty {
    fn from(d: ExerciseDifficulty) -> Self {
        match d {
            ExerciseDifficulty::Beginner => Self::Beginner,
            ExerciseDifficulty::Intermediate => Self::Intermediate,
            ExerciseDifficulty::Advanced => Self::Advanced,
        }
    }
}

impl From<svc::ExerciseDifficulty> for ExerciseDifficulty {
    fn from(d: svc::ExerciseDifficulty) -> Self {
        match d {
            svc::ExerciseDifficulty::Beginner => Self::Beginner,
            svc::ExerciseDifficulty::Intermediate => Self::Intermediate,
            svc::ExerciseDifficulty::Advanced => Self::Advanced,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExerciseSource {
    Manual,
    Agent,
    Imported,
}

impl From<ExerciseSource> for svc::ExerciseSource {
    fn from(s: ExerciseSource) -> Self {
        match s {
            ExerciseSource::Manual => Self::Manual,
            ExerciseSource::Agent => Self::Agent,
            ExerciseSource::Imported => Self::Imported,
        }
    }
}

impl From<svc::ExerciseSource> for ExerciseSource {
    fn from(s: svc::ExerciseSource) -> Self {
        match s {
            svc::ExerciseSource::Manual => Self::Manual,
            svc::ExerciseSource::Agent => Self::Agent,
            svc::ExerciseSource::Imported => Self::Imported,
        }
    }
}

// --- Structs -----------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ExerciseMetadata {
    pub id: String,
    pub space_id: String,
    #[serde(default)]
    pub topic: Option<String>,
    pub difficulty: ExerciseDifficulty,
    pub source: ExerciseSource,
    #[specta(type = i32)]
    pub created_at_ms: i64,
    #[specta(type = i32)]
    pub length: i64,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExerciseDraftMetadata {
    pub space_id: String,
    #[serde(default)]
    pub topic: Option<String>,
    #[serde(default)]
    pub difficulty: Option<ExerciseDifficulty>,
    #[serde(default)]
    pub source: Option<ExerciseSource>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ExerciseDraft {
    pub message: String,
    pub meta: ExerciseDraftMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Exercise {
    pub cid: String,
    pub message: String,
    pub meta: ExerciseMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ExerciseAttempt {
    pub exercise_id: String,
    pub space_id: String,
    pub wpm: f64,
    pub accuracy: f64,
    #[specta(type = i32)]
    pub duration_ms: i64,
    #[specta(type = i32)]
    pub completed_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LeaderboardEntry {
    pub space_id: String,
    pub exercise_id: String,
    #[serde(default)]
    pub peer_id: Option<String>,
    #[serde(default)]
    pub display_name: Option<String>,
    pub wpm: f64,
    pub accuracy: f64,
    #[specta(type = i32)]
    pub completed_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GenerateExerciseInput {
    pub space_id: String,
    #[serde(default)]
    pub topic: Option<String>,
    #[serde(default)]
    pub difficulty: Option<ExerciseDifficulty>,
    #[serde(default)]
    #[specta(type = Option<i32>)]
    pub length: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RecordSessionResponse {
    pub ok: bool,
    pub leaderboard: Vec<LeaderboardEntry>,
}

// --- Conversions -------------------------------------------------------------

impl From<svc::Exercise> for Exercise {
    fn from(e: svc::Exercise) -> Self {
        Self {
            cid: e.cid,
            message: e.message,
            meta: ExerciseMetadata {
                id: e.meta.id,
                space_id: e.meta.space_id,
                topic: e.meta.topic,
                difficulty: e.meta.difficulty.into(),
                source: e.meta.source.into(),
                created_at_ms: e.meta.created_at_ms,
                length: e.meta.length,
                tags: e.meta.tags,
            },
        }
    }
}

impl From<svc::ExerciseDraft> for ExerciseDraft {
    fn from(d: svc::ExerciseDraft) -> Self {
        Self {
            message: d.message,
            meta: ExerciseDraftMetadata {
                space_id: d.meta.space_id,
                topic: d.meta.topic,
                difficulty: d.meta.difficulty.map(Into::into),
                source: d.meta.source.map(Into::into),
                tags: d.meta.tags,
            },
        }
    }
}

impl From<ExerciseDraft> for svc::ExerciseDraft {
    fn from(d: ExerciseDraft) -> Self {
        Self {
            message: d.message,
            meta: svc::ExerciseDraftMetadata {
                space_id: d.meta.space_id,
                topic: d.meta.topic,
                difficulty: d.meta.difficulty.map(Into::into),
                source: d.meta.source.map(Into::into),
                tags: d.meta.tags,
            },
        }
    }
}

impl From<ExerciseAttempt> for svc::ExerciseAttempt {
    fn from(a: ExerciseAttempt) -> Self {
        Self {
            exercise_id: a.exercise_id,
            space_id: a.space_id,
            wpm: a.wpm,
            accuracy: a.accuracy,
            duration_ms: a.duration_ms,
            completed_at_ms: a.completed_at_ms,
        }
    }
}

impl From<svc::LeaderboardEntry> for LeaderboardEntry {
    fn from(l: svc::LeaderboardEntry) -> Self {
        Self {
            space_id: l.space_id,
            exercise_id: l.exercise_id,
            peer_id: l.peer_id,
            display_name: l.display_name,
            wpm: l.wpm,
            accuracy: l.accuracy,
            completed_at_ms: l.completed_at_ms,
        }
    }
}

impl From<GenerateExerciseInput> for svc::GenerateExerciseInput {
    fn from(i: GenerateExerciseInput) -> Self {
        Self {
            space_id: i.space_id,
            topic: i.topic,
            difficulty: i.difficulty.map(Into::into),
            length: i.length,
        }
    }
}

// --- Handlers ----------------------------------------------------------------

pub async fn list_exercises(state: &AppState, space_id: Option<String>) -> DesktopResult<Vec<Exercise>> {
    // Electron defaults missing `spaceId` to `""` (so the call returns
    // the empty list rather than erroring). Mirror that here.
    let id = space_id.unwrap_or_default();
    let list = state.practice.list_exercises(&id).await;
    Ok(list.into_iter().map(Exercise::from).collect())
}

pub async fn save_exercise(state: &AppState, draft: ExerciseDraft) -> DesktopResult<Exercise> {
    let saved = state.practice.save_exercise(draft.into()).await;
    Ok(saved.into())
}

pub async fn record_session(state: &AppState, attempt: ExerciseAttempt) -> DesktopResult<RecordSessionResponse> {
    let leaderboard = state.practice.record_session(attempt.into()).await;
    Ok(RecordSessionResponse {
        ok: true,
        leaderboard: leaderboard.into_iter().map(LeaderboardEntry::from).collect(),
    })
}

pub async fn generate_exercise(state: &AppState, input: GenerateExerciseInput) -> DesktopResult<ExerciseDraft> {
    let draft = state.practice.generate_exercise(input.into()).await;
    Ok(draft.into())
}
