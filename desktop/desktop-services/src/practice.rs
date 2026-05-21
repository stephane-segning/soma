//! In-process practice service.
//!
//! Mirrors the Electron `PracticeController` (see
//! `desktop/soma/src/main/controllers/practice-controller.ts`): a tiny
//! state container with content-addressed exercise IDs and an in-memory
//! attempt log. No daemon backing — this is purely process-local state
//! that gets reseeded on every boot.
//!
//! The wire DTOs live in `desktop-api::practice`; here we deal in plain
//! Rust types and let the presenter layer adapt them.

use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use rand::seq::IndexedRandom;
use serde_json::Value;
use sha2::{Digest, Sha256};
use tokio::sync::Mutex;

/// Exercise difficulty levels. Wire values use kebab-case so a future
/// `multi-word` variant doesn't break the contract.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExerciseDifficulty {
    Beginner,
    Intermediate,
    Advanced,
}

impl ExerciseDifficulty {
    fn as_str(self) -> &'static str {
        match self {
            Self::Beginner => "beginner",
            Self::Intermediate => "intermediate",
            Self::Advanced => "advanced",
        }
    }
}

/// Where an exercise came from — manual entry, agent generation, or an
/// imported drill set.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExerciseSource {
    Manual,
    Agent,
    Imported,
}

impl ExerciseSource {
    fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Agent => "agent",
            Self::Imported => "imported",
        }
    }
}

#[derive(Debug, Clone)]
pub struct ExerciseMetadata {
    pub id: String,
    pub space_id: String,
    pub topic: Option<String>,
    pub difficulty: ExerciseDifficulty,
    pub source: ExerciseSource,
    pub created_at_ms: i64,
    pub length: i64,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default)]
pub struct ExerciseDraftMetadata {
    pub space_id: String,
    pub topic: Option<String>,
    pub difficulty: Option<ExerciseDifficulty>,
    pub source: Option<ExerciseSource>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone)]
pub struct ExerciseDraft {
    pub message: String,
    pub meta: ExerciseDraftMetadata,
}

#[derive(Debug, Clone)]
pub struct Exercise {
    pub cid: String,
    pub message: String,
    pub meta: ExerciseMetadata,
}

#[derive(Debug, Clone)]
pub struct ExerciseAttempt {
    pub exercise_id: String,
    pub space_id: String,
    pub wpm: f64,
    pub accuracy: f64,
    pub duration_ms: i64,
    pub completed_at_ms: i64,
}

#[derive(Debug, Clone)]
pub struct LeaderboardEntry {
    pub space_id: String,
    pub exercise_id: String,
    pub peer_id: Option<String>,
    pub display_name: Option<String>,
    pub wpm: f64,
    pub accuracy: f64,
    pub completed_at_ms: i64,
}

#[derive(Debug, Clone, Default)]
pub struct GenerateExerciseInput {
    pub space_id: String,
    pub topic: Option<String>,
    pub difficulty: Option<ExerciseDifficulty>,
    pub length: Option<i64>,
}

const SEED_SPACES: &[&str] = &["practice", "focus"];

const EXERCISE_BANK: &[&str] = &[
    "flowing keystrokes build reliable muscle memory",
    "pace yourself and trust the rhythm of the keyboard",
    "tiny habits create durable accuracy for every session",
    "sustain focus, relax shoulders, breathe, and continue",
    "libp2p peers sync practice stats quietly in the background",
];

const FALLBACK_PHRASE: &str = "practice steadily with short bursts of typing";

/// Process-wide practice service. Holds the in-memory exercise + attempt
/// log behind a `tokio::sync::Mutex` so it composes with the rest of the
/// async stack. Seeded eagerly on construction (one-shot, matches
/// Electron's `seeded` guard).
pub struct PracticeService {
    exercises_by_space: Mutex<HashMap<String, Vec<Exercise>>>,
    attempts_by_space: Mutex<HashMap<String, Vec<ExerciseAttempt>>>,
}

impl PracticeService {
    pub fn new() -> Self {
        // Build the seed map up-front and stash it inside the Mutex —
        // mirrors Electron's constructor-time `seed()` without needing
        // to lock a tokio mutex from sync context.
        let mut seeded: HashMap<String, Vec<Exercise>> = HashMap::new();
        for space_id in SEED_SPACES {
            let warmup = build_exercise(ExerciseDraft {
                message: "type with intention and listen to every key you press".into(),
                meta: ExerciseDraftMetadata {
                    space_id: (*space_id).into(),
                    difficulty: Some(ExerciseDifficulty::Beginner),
                    source: Some(ExerciseSource::Manual),
                    topic: Some("warmup".into()),
                    tags: None,
                },
            });
            let collab = build_exercise(ExerciseDraft {
                message: "collaborative typing drills keep your identity synced through the soma-daemon while agentd mixes in new phrases".into(),
                meta: ExerciseDraftMetadata {
                    space_id: (*space_id).into(),
                    difficulty: Some(ExerciseDifficulty::Intermediate),
                    source: Some(ExerciseSource::Agent),
                    topic: Some("collaboration".into()),
                    tags: None,
                },
            });
            // Most-recent-first ordering matches Electron's
            // `storeExercise` (which prepends): collab inserts second so
            // it ends up before warmup.
            seeded.insert((*space_id).into(), vec![collab, warmup]);
        }
        Self {
            exercises_by_space: Mutex::new(seeded),
            attempts_by_space: Mutex::new(HashMap::new()),
        }
    }

    pub async fn list_exercises(&self, space_id: &str) -> Vec<Exercise> {
        self.exercises_by_space
            .lock()
            .await
            .get(space_id)
            .cloned()
            .unwrap_or_default()
    }

    pub async fn save_exercise(&self, draft: ExerciseDraft) -> Exercise {
        let exercise = build_exercise(draft);
        let mut map = self.exercises_by_space.lock().await;
        let bucket = map.entry(exercise.meta.space_id.clone()).or_default();
        bucket.insert(0, exercise.clone());
        exercise
    }

    pub async fn record_session(&self, attempt: ExerciseAttempt) -> Vec<LeaderboardEntry> {
        let space_id = attempt.space_id.clone();
        {
            let mut map = self.attempts_by_space.lock().await;
            map.entry(space_id.clone()).or_default().push(attempt);
        }
        self.build_leaderboard(&space_id).await
    }

    async fn build_leaderboard(&self, space_id: &str) -> Vec<LeaderboardEntry> {
        let attempts = {
            let map = self.attempts_by_space.lock().await;
            map.get(space_id).cloned().unwrap_or_default()
        };
        let mut sorted = attempts;
        sorted.sort_by(|a, b| {
            if (b.wpm - a.wpm).abs() < f64::EPSILON {
                b.accuracy.partial_cmp(&a.accuracy).unwrap_or(std::cmp::Ordering::Equal)
            } else {
                b.wpm.partial_cmp(&a.wpm).unwrap_or(std::cmp::Ordering::Equal)
            }
        });
        sorted
            .into_iter()
            .take(10)
            .map(|a| LeaderboardEntry {
                space_id: a.space_id,
                exercise_id: a.exercise_id,
                peer_id: None,
                display_name: None,
                wpm: a.wpm,
                accuracy: a.accuracy,
                completed_at_ms: a.completed_at_ms,
            })
            .collect()
    }

    pub async fn generate_exercise(&self, input: GenerateExerciseInput) -> ExerciseDraft {
        let mut rng = rand::rng();
        let chosen = match input.topic.clone() {
            Some(t) => t,
            None => EXERCISE_BANK
                .choose(&mut rng)
                .map(|s| (*s).to_string())
                .unwrap_or_else(|| FALLBACK_PHRASE.to_string()),
        };
        let desired_length = input.length.unwrap_or(140).max(0) as usize;
        let mut message = chosen;
        while message.len() < desired_length {
            let next = EXERCISE_BANK
                .choose(&mut rng)
                .map(|s| (*s).to_string())
                .unwrap_or_else(|| FALLBACK_PHRASE.to_string());
            message = format!("{message}. {next}");
        }
        // Match Electron's `.slice(0, desiredLength + 20)` byte-trim. Snap
        // to a char boundary so we never split a UTF-8 codepoint.
        let cap = desired_length.saturating_add(20);
        if message.len() > cap {
            let mut end = cap;
            while end > 0 && !message.is_char_boundary(end) {
                end -= 1;
            }
            message.truncate(end);
        }
        ExerciseDraft {
            message,
            meta: ExerciseDraftMetadata {
                space_id: input.space_id,
                topic: input.topic,
                difficulty: Some(input.difficulty.unwrap_or(ExerciseDifficulty::Intermediate)),
                source: Some(ExerciseSource::Agent),
                tags: None,
            },
        }
    }
}

impl Default for PracticeService {
    fn default() -> Self {
        Self::new()
    }
}

fn build_exercise(draft: ExerciseDraft) -> Exercise {
    let difficulty = draft.meta.difficulty.unwrap_or(ExerciseDifficulty::Intermediate);
    let source = draft.meta.source.unwrap_or(ExerciseSource::Agent);

    // CID hashes only the *content*: the message + the intrinsic metadata
    // that identifies this exercise. Volatile/derived fields (id,
    // createdAtMs, length) are excluded — otherwise two identical drafts
    // would always get different CIDs and content-addressing breaks.
    let cid = cid_from_content(&draft.message, &draft.meta.space_id, draft.meta.topic.as_deref(), difficulty, source, draft.meta.tags.as_deref());

    let length = draft.message.chars().count() as i64;
    let meta = ExerciseMetadata {
        id: cuid2::create_id(),
        space_id: draft.meta.space_id,
        topic: draft.meta.topic,
        difficulty,
        source,
        created_at_ms: now_ms(),
        length,
        tags: draft.meta.tags,
    };
    Exercise {
        cid,
        message: draft.message,
        meta,
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// SHA-256 over the canonical-JSON encoding of the content-defining
/// fields. Mirrors the Electron implementation byte-for-byte so the same
/// exercise produces the same CID across the two shells.
fn cid_from_content(
    message: &str,
    space_id: &str,
    topic: Option<&str>,
    difficulty: ExerciseDifficulty,
    source: ExerciseSource,
    tags: Option<&[String]>,
) -> String {
    let mut content = serde_json::Map::new();
    content.insert("message".into(), Value::String(message.into()));
    content.insert("spaceId".into(), Value::String(space_id.into()));
    if let Some(topic) = topic {
        content.insert("topic".into(), Value::String(topic.into()));
    }
    content.insert("difficulty".into(), Value::String(difficulty.as_str().into()));
    content.insert("source".into(), Value::String(source.as_str().into()));
    if let Some(tags) = tags {
        let arr: Vec<Value> = tags.iter().map(|t| Value::String(t.clone())).collect();
        content.insert("tags".into(), Value::Array(arr));
    }
    let canonical = canonical_json(&Value::Object(content));
    let digest = Sha256::digest(canonical.as_bytes());
    hex_encode(&digest)
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}

/// Canonical JSON serialization for content addressing: object keys
/// sorted alphabetically at every level, arrays preserve insertion
/// order, `null` is emitted as in JS (`Option::None` is dropped *at the
/// caller* via not inserting the key, mirroring `undefined` skipping in
/// the TS version). Matches RFC 8785-style intent without pulling in a
/// crate.
fn canonical_json(value: &Value) -> String {
    match value {
        Value::Null => "null".into(),
        Value::Bool(b) => if *b { "true".into() } else { "false".into() },
        Value::Number(n) => n.to_string(),
        Value::String(s) => serde_json::to_string(s).expect("string is serializable"),
        Value::Array(arr) => {
            let parts: Vec<String> = arr.iter().map(canonical_json).collect();
            format!("[{}]", parts.join(","))
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let parts: Vec<String> = keys
                .into_iter()
                .map(|k| {
                    let key = serde_json::to_string(k).expect("key is serializable");
                    format!("{}:{}", key, canonical_json(&map[k]))
                })
                .collect();
            format!("{{{}}}", parts.join(","))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The canonical-JSON output must match `JSON.stringify` style for
    /// scalars while sorting keys alphabetically. Cross-check: the same
    /// payload run through the Electron `canonicalJson` should produce
    /// the same string (and therefore the same SHA-256 hex digest).
    #[test]
    fn canonical_json_sorts_keys() {
        let mut map = serde_json::Map::new();
        map.insert("z".into(), Value::String("last".into()));
        map.insert("a".into(), Value::String("first".into()));
        map.insert("m".into(), Value::Number(serde_json::Number::from(42)));
        let s = canonical_json(&Value::Object(map));
        assert_eq!(s, r#"{"a":"first","m":42,"z":"last"}"#);
    }

    #[test]
    fn canonical_json_preserves_array_order() {
        let arr = Value::Array(vec![
            Value::String("b".into()),
            Value::String("a".into()),
            Value::String("c".into()),
        ]);
        assert_eq!(canonical_json(&arr), r#"["b","a","c"]"#);
    }

    #[test]
    fn cid_is_stable_and_matches_ts() {
        // The TS reference hash for this exact payload, computed via:
        //   crypto.createHash("sha256")
        //     .update('{"difficulty":"beginner","message":"hi","source":"manual","spaceId":"s"}')
        //     .digest("hex")
        let canonical =
            r#"{"difficulty":"beginner","message":"hi","source":"manual","spaceId":"s"}"#;
        let expected = hex_encode(&Sha256::digest(canonical.as_bytes()));

        let cid = cid_from_content(
            "hi",
            "s",
            None,
            ExerciseDifficulty::Beginner,
            ExerciseSource::Manual,
            None,
        );
        assert_eq!(cid, expected);
    }

    #[test]
    fn cid_includes_topic_and_tags_when_present() {
        let tags = vec!["alpha".to_string(), "beta".to_string()];
        let cid_no_tags = cid_from_content(
            "hi",
            "s",
            Some("warmup"),
            ExerciseDifficulty::Beginner,
            ExerciseSource::Manual,
            None,
        );
        let cid_with_tags = cid_from_content(
            "hi",
            "s",
            Some("warmup"),
            ExerciseDifficulty::Beginner,
            ExerciseSource::Manual,
            Some(&tags),
        );
        assert_ne!(cid_no_tags, cid_with_tags);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn seeds_each_warmup_space() {
        let svc = PracticeService::new();
        for space in ["practice", "focus"] {
            let exercises = svc.list_exercises(space).await;
            assert_eq!(exercises.len(), 2, "space {space} should be seeded");
        }
    }

    #[tokio::test(flavor = "current_thread")]
    async fn save_prepends_to_list() {
        let svc = PracticeService::new();
        let saved = svc
            .save_exercise(ExerciseDraft {
                message: "hello world".into(),
                meta: ExerciseDraftMetadata {
                    space_id: "practice".into(),
                    ..Default::default()
                },
            })
            .await;
        let list = svc.list_exercises("practice").await;
        assert_eq!(list.first().map(|e| e.cid.clone()), Some(saved.cid));
    }

    #[tokio::test(flavor = "current_thread")]
    async fn record_session_sorts_leaderboard() {
        let svc = PracticeService::new();
        let attempts = [
            (50.0, 0.9),
            (60.0, 0.85),
            (60.0, 0.95),
            (40.0, 1.0),
        ];
        for (wpm, accuracy) in attempts {
            svc.record_session(ExerciseAttempt {
                exercise_id: "x".into(),
                space_id: "practice".into(),
                wpm,
                accuracy,
                duration_ms: 1000,
                completed_at_ms: 0,
            })
            .await;
        }
        let board = svc.build_leaderboard("practice").await;
        assert_eq!(board.len(), 4);
        // 60/0.95 first, then 60/0.85, then 50/0.9, then 40/1.0
        assert_eq!(board[0].wpm, 60.0);
        assert!((board[0].accuracy - 0.95).abs() < f64::EPSILON);
        assert_eq!(board[1].wpm, 60.0);
        assert!((board[1].accuracy - 0.85).abs() < f64::EPSILON);
        assert_eq!(board[2].wpm, 50.0);
        assert_eq!(board[3].wpm, 40.0);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn generate_exercise_pads_to_length() {
        let svc = PracticeService::new();
        let draft = svc
            .generate_exercise(GenerateExerciseInput {
                space_id: "practice".into(),
                topic: Some("hello".into()),
                difficulty: None,
                length: Some(200),
            })
            .await;
        assert!(draft.message.len() >= 200);
        assert!(draft.message.len() <= 220);
        assert!(matches!(draft.meta.source, Some(ExerciseSource::Agent)));
    }
}
