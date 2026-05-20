//! `#[tauri::command]` modules. Each module replaces one of the old
//! Electron `controllers/*.ts` + `command-registry/*-handlers.ts` pairs;
//! the daemon-client translation layer is gone (the binary links
//! `soma-daemon` directly).
//!
//! The binary (`desktop-app`) enumerates the commands in its
//! `tauri::generate_handler![…]` call — keeping that list in the binary
//! avoids needing a `generate_handler!` macro export with public macros.

pub mod agent;
pub mod blobs;
pub mod daemon;
pub mod documents;
pub mod settings_storage;
pub mod spaces;
pub mod state;
pub mod window;

pub use state::AppState;
