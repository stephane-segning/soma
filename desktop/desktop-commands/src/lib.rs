//! Tauri presenter layer.
//!
//! Every domain command (`spaces_*`, `documents_*`, `blobs_*`, `agent_*`,
//! `daemon_*`, `search`) is a one-liner that hands off to the
//! transport-agnostic handler in `desktop-api`. The body stays here only
//! for the surfaces that are *intrinsically* desktop-bound — window
//! controls, the local `tauri-plugin-store`-backed key/value, settings —
//! because the HTTP BFF will model those differently.
//!
//! Re-exports `AppState` from `desktop-api` so the binary doesn't need to
//! reach across crates for the type.

pub mod agent;
pub mod blobs;
pub mod daemon;
pub mod documents;
pub mod practice;
pub mod search;
pub mod settings_storage;
pub mod spaces;
pub mod window;

pub use desktop_api::AppState;
