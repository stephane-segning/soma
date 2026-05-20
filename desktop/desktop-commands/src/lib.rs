//! `#[tauri::command]` functions exposed to the renderer. Replaces the
//! Electron-side `command-registry/*` handlers + `controllers/*` thin
//! facades, collapsed into one Rust module per controller surface.
//!
//! Phase 1: empty stubs. Phase 2+ fills in the daemon/agent surface.

pub mod settings_storage;
pub mod window;

use tauri::{Runtime, generate_handler};

/// Convenience handler bundle for `tauri::Builder::invoke_handler`. Keeping
/// this in one place means `desktop-app` doesn't have to enumerate every
/// command — when a new one lands, this list grows once.
pub fn handler<R: Runtime>() -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static {
    generate_handler![
        settings_storage::db_storage_get,
        settings_storage::db_storage_set,
        settings_storage::db_storage_remove,
        settings_storage::db_storage_clear,
        settings_storage::db_storage_keys,
        settings_storage::settings_get_all,
        window::window_minimize,
        window::window_toggle_maximize,
        window::window_close,
    ]
}
