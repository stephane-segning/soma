//! Wall-clock helpers shared across the desktop crates.
//!
//! Lives in `desktop-core` so `desktop-api`, `desktop-commands`,
//! `desktop-daemon`, etc. all read the same definition. Returns `i64`
//! milliseconds since the Unix epoch — matches the existing wire shape
//! the renderer consumes (`number` in TS, but the in-Rust type stays
//! `i64` for arithmetic correctness; specta hints translate it at the
//! IPC boundary).

use std::time::{SystemTime, UNIX_EPOCH};

/// Milliseconds since the Unix epoch. Clamps to `0` if the clock is
/// somehow earlier than the epoch (which we should never see, but
/// `duration_since` returns an error in that case).
pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
