//! Window control commands. Replaces `controllers/window-controller.ts` +
//! `command-registry/window-log-handlers.ts`.
//!
//! Note that in Tauri V2 the renderer can usually call window methods
//! directly via `@tauri-apps/api/window`, so these commands exist mainly
//! for symmetry with the existing preload bridge (`window:control`).

use desktop_core::error::{DesktopError, DesktopResult};
use tauri::Runtime;

fn window<R: Runtime>(app: &tauri::AppHandle<R>) -> DesktopResult<tauri::WebviewWindow<R>> {
    use tauri::Manager;
    app.get_webview_window("main").ok_or_else(|| DesktopError::other("no main window"))
}

#[tauri::command]
pub async fn window_minimize<R: Runtime>(app: tauri::AppHandle<R>) -> DesktopResult<()> {
    window(&app)?.minimize().map_err(DesktopError::other)
}

#[tauri::command]
pub async fn window_toggle_maximize<R: Runtime>(app: tauri::AppHandle<R>) -> DesktopResult<()> {
    let win = window(&app)?;
    let maxed = win.is_maximized().map_err(DesktopError::other)?;
    if maxed {
        win.unmaximize().map_err(DesktopError::other)
    } else {
        win.maximize().map_err(DesktopError::other)
    }
}

#[tauri::command]
pub async fn window_close<R: Runtime>(app: tauri::AppHandle<R>) -> DesktopResult<()> {
    window(&app)?.close().map_err(DesktopError::other)
}
