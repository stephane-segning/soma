//! Transport-agnostic API surface for the Soma client.
//!
//! Handlers are plain async functions over a borrowed [`AppState`]. They
//! know nothing about Tauri's `invoke`, axum's extractors, or HTTP — that
//! coupling lives in the *presenter* crates that wrap each handler:
//!
//! * `desktop-commands` exposes them as `#[tauri::command]`s.
//! * (Future) `desktop-bff` will expose them as `axum` routes.
//!
//! Every wire DTO (`*Args`, `*Result`) is owned here so the bindings the
//! SDK consumes are produced from a single source.
//!
//! Platform-only surfaces — window controls, the tauri-plugin-store-backed
//! settings, the `soma-blob://` scheme — intentionally live in
//! `desktop-commands` / `desktop-services` instead, because the HTTP
//! transport has its own equivalents (per-user DB settings, signed blob
//! URLs).

pub mod agent;
pub mod blobs;
pub mod daemon;
pub mod documents;
pub mod events;
pub mod practice;
pub mod search;
pub mod spaces;
pub mod state;

pub use state::{AppState, DOMAIN_EVENT_CHANNEL_CAPACITY};
