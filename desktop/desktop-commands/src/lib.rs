//! `#[tauri::command]` modules. Each module replaces one of the old
//! Electron `controllers/*.ts` + `command-registry/*-handlers.ts` pairs;
//! the daemon-client translation layer is gone (the binary links
//! `soma-daemon` directly).
//!
//! Command names follow `<domain>_<verb>` (`spaces_list`,
//! `documents_ensure_page`, …) to match the renderer's existing IPC
//! contract and HTTP-route style we expect to use for the future BFF.

pub mod agent;
pub mod blobs;
pub mod daemon;
pub mod documents;
pub mod search;
pub mod settings_storage;
pub mod spaces;
pub mod state;
pub mod window;

pub use state::AppState;
