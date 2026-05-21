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

use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap};
use std::time::{SystemTime, UNIX_EPOCH};

use rand::seq::IndexedRandom;
use serde_json::Value;
use sha2::{Digest, Sha256};
use tokio::sync::Mutex;

/// Hard cap on how many attempts we keep per space. The leaderboard only
/// surfaces the top 10, so older attempts contribute nothing once the
/// bucket fills. Bounding the bucket also keeps `build_leaderboard`
/// O(cap * log cap) regardless of total session count.
const MAX_ATTEMPTS_PER_SPACE: usize = 1000;

/// How many entries the leaderboard shows. Mirrors the Electron
/// `.slice(0, 10)` after the sort.
const LEADERBOARD_SIZE: usize = 10;

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
            let bucket = map.entry(space_id.clone()).or_default();
            bucket.push(attempt);
            // Drop oldest entries once we exceed the cap. Stable order
            // (`drain(0..excess)`) so the most recent attempts always
            // win the tie-breakers in `build_leaderboard`.
            if bucket.len() > MAX_ATTEMPTS_PER_SPACE {
                let excess = bucket.len() - MAX_ATTEMPTS_PER_SPACE;
                bucket.drain(0..excess);
            }
        }
        self.build_leaderboard(&space_id).await
    }

    async fn build_leaderboard(&self, space_id: &str) -> Vec<LeaderboardEntry> {
        // Top-N via a min-heap keyed by `(wpm, accuracy)`: pop the
        // smallest once the heap exceeds `LEADERBOARD_SIZE`, so we
        // only ever keep the best 10 in memory and never sort the
        // full attempts log. Combined with the per-space cap this
        // keeps `record_session` bounded regardless of session count.
        let map = self.attempts_by_space.lock().await;
        let Some(attempts) = map.get(space_id) else {
            return Vec::new();
        };
        let mut heap: BinaryHeap<RankedAttempt<'_>> = BinaryHeap::with_capacity(LEADERBOARD_SIZE + 1);
        for attempt in attempts {
            heap.push(RankedAttempt::min(attempt));
            if heap.len() > LEADERBOARD_SIZE {
                heap.pop();
            }
        }
        let mut top: Vec<&ExerciseAttempt> = heap.into_iter().map(|r| r.0).collect();
        // Heap pops in min-first order; reverse to get the
        // best-first order the renderer expects.
        top.sort_by(|a, b| attempt_cmp(b, a));
        top.into_iter()
            .map(|a| LeaderboardEntry {
                space_id: a.space_id.clone(),
                exercise_id: a.exercise_id.clone(),
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
        // Renderer + Electron measure `length` in JavaScript string
        // semantics (UTF-16 code units), so a topic with emoji or CJK
        // characters needs UTF-16 accounting to honor the requested
        // size. `message.len()` would count UTF-8 bytes and exit the
        // loop too late (or too early, after the truncate).
        let desired_length = input.length.unwrap_or(140).max(0) as usize;
        let mut message = chosen;
        while utf16_len(&message) < desired_length {
            let next = EXERCISE_BANK
                .choose(&mut rng)
                .map(|s| (*s).to_string())
                .unwrap_or_else(|| FALLBACK_PHRASE.to_string());
            message = format!("{message}. {next}");
        }
        // Match Electron's `.slice(0, desiredLength + 20)`: UTF-16
        // truncation that never splits a Unicode scalar value.
        let cap = desired_length.saturating_add(20);
        message = truncate_utf16(&message, cap);
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

    // JS `string.length` counts UTF-16 code units, not Unicode scalar
    // values — emoji and other non-BMP characters take two units. We
    // mirror that so the renderer + persisted metadata agree on length.
    let length = utf16_len(&draft.message) as i64;
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

/// JS `string.length` parity: count UTF-16 code units. Non-BMP
/// characters (e.g. `"😀"`) count as 2 so the result matches what the
/// renderer reads from `String.prototype.length`.
fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// JS `string.slice(0, max_units)` parity: truncate to at most
/// `max_units` UTF-16 code units, never splitting a Unicode scalar
/// value. If a surrogate pair would straddle the boundary we drop the
/// whole pair (matching `slice`'s behavior when called with the same
/// boundary).
fn truncate_utf16(s: &str, max_units: usize) -> String {
    if utf16_len(s) <= max_units {
        return s.to_string();
    }
    let mut acc = 0usize;
    let mut end_byte = 0;
    for (idx, ch) in s.char_indices() {
        let w = ch.len_utf16();
        if acc + w > max_units {
            break;
        }
        acc += w;
        end_byte = idx + ch.len_utf8();
    }
    s[..end_byte].to_string()
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Leaderboard order: highest `wpm` first, ties broken by higher
/// `accuracy`. Pulled out of the heap and reused by the final sort so
/// both orderings stay in sync.
fn attempt_cmp(a: &ExerciseAttempt, b: &ExerciseAttempt) -> Ordering {
    a.wpm
        .partial_cmp(&b.wpm)
        .unwrap_or(Ordering::Equal)
        .then_with(|| a.accuracy.partial_cmp(&b.accuracy).unwrap_or(Ordering::Equal))
}

/// Heap wrapper that inverts `attempt_cmp` so the standard max-heap acts
/// like a min-heap — pop returns the *worst* attempt currently held,
/// which is what we want when shedding entries once the heap exceeds
/// `LEADERBOARD_SIZE`.
struct RankedAttempt<'a>(&'a ExerciseAttempt);

impl<'a> RankedAttempt<'a> {
    fn min(a: &'a ExerciseAttempt) -> Self {
        Self(a)
    }
}

impl PartialEq for RankedAttempt<'_> {
    fn eq(&self, other: &Self) -> bool {
        attempt_cmp(self.0, other.0) == Ordering::Equal
    }
}

impl Eq for RankedAttempt<'_> {}

impl Ord for RankedAttempt<'_> {
    fn cmp(&self, other: &Self) -> Ordering {
        // Reverse so the max-heap exposes the *worst* attempt at the top.
        attempt_cmp(other.0, self.0)
    }
}

impl PartialOrd for RankedAttempt<'_> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
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
        // Length is measured in UTF-16 code units (JS `string.length`
        // semantics), not bytes — keep these checks consistent with
        // what the renderer would read.
        let len = utf16_len(&draft.message);
        assert!(len >= 200, "got {len} UTF-16 units");
        assert!(len <= 220, "got {len} UTF-16 units");
        assert!(matches!(draft.meta.source, Some(ExerciseSource::Agent)));
    }

    #[test]
    fn utf16_truncate_keeps_surrogate_pairs_whole() {
        // "😀" is a single Unicode scalar value that takes 2 UTF-16
        // code units. Truncating at 1 should drop it rather than split
        // it into a lone surrogate.
        let s = "ab😀";
        assert_eq!(utf16_len(s), 4); // a + b + 2 (😀)
        assert_eq!(truncate_utf16(s, 4), "ab😀");
        assert_eq!(truncate_utf16(s, 3), "ab"); // can't fit half a surrogate pair
        assert_eq!(truncate_utf16(s, 2), "ab");
        assert_eq!(truncate_utf16(s, 1), "a");
        assert_eq!(truncate_utf16(s, 0), "");
    }

    #[tokio::test(flavor = "current_thread")]
    async fn build_exercise_length_uses_utf16_units() {
        let svc = PracticeService::new();
        let saved = svc
            .save_exercise(ExerciseDraft {
                message: "ab😀".into(),
                meta: ExerciseDraftMetadata {
                    space_id: "practice".into(),
                    ..Default::default()
                },
            })
            .await;
        // JS `"ab😀".length === 4`; previous `chars().count()` gave 3.
        assert_eq!(saved.meta.length, 4);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn record_session_caps_history_per_space() {
        let svc = PracticeService::new();
        // Push one more attempt than the cap allows, distinct wpm
        // values so we can verify which attempt got evicted.
        for i in 0..=(MAX_ATTEMPTS_PER_SPACE as i64) {
            svc.record_session(ExerciseAttempt {
                exercise_id: "x".into(),
                space_id: "practice".into(),
                wpm: i as f64,
                accuracy: 0.5,
                duration_ms: 0,
                completed_at_ms: i,
            })
            .await;
        }
        // Inspect bucket length directly via the public surface: the
        // leaderboard always returns at most LEADERBOARD_SIZE, so
        // assert via behavior: the lowest-wpm attempt (wpm == 0)
        // should have been evicted.
        let map = svc.attempts_by_space.lock().await;
        let bucket = map.get("practice").expect("bucket exists");
        assert_eq!(bucket.len(), MAX_ATTEMPTS_PER_SPACE);
        assert!(
            bucket.iter().all(|a| a.wpm > 0.0),
            "oldest attempt (wpm = 0) should have been drained"
        );
    }

    #[tokio::test(flavor = "current_thread")]
    async fn build_leaderboard_caps_at_size_limit() {
        let svc = PracticeService::new();
        for i in 0..(LEADERBOARD_SIZE * 3) {
            svc.record_session(ExerciseAttempt {
                exercise_id: format!("e{i}"),
                space_id: "practice".into(),
                wpm: i as f64,
                accuracy: 0.5,
                duration_ms: 0,
                completed_at_ms: i as i64,
            })
            .await;
        }
        let board = svc.build_leaderboard("practice").await;
        assert_eq!(board.len(), LEADERBOARD_SIZE);
        // Best-first ordering: top entry has the highest wpm.
        let highest = (LEADERBOARD_SIZE * 3 - 1) as f64;
        assert_eq!(board[0].wpm, highest);
    }
}
