//! Window controls. Replaces `controllers/window-controller.ts` +
//! `command-registry/window-log-handlers.ts`. Renderer call sites use
//! `window:control` with an `action` discriminator; we accept the same
//! shape so the cutover doesn't need a rename.

use desktop_core::error::{DesktopError, DesktopResult};
use serde::Deserialize;
use tauri::Runtime;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowControlArgs {
    pub action: WindowControlAction,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WindowControlAction {
    Minimize,
    ToggleMaximize,
    Close,
}

fn window<R: Runtime>(app: &tauri::AppHandle<R>) -> DesktopResult<tauri::WebviewWindow<R>> {
    use tauri::Manager;
    app.get_webview_window("main").ok_or_else(|| DesktopError::other("no main window"))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn window_control<R: Runtime>(app: tauri::AppHandle<R>, args: WindowControlArgs) -> DesktopResult<()> {
    let win = window(&app)?;
    match args.action {
        WindowControlAction::Minimize => win.minimize().map_err(DesktopError::other),
        WindowControlAction::ToggleMaximize => {
            let maxed = win.is_maximized().map_err(DesktopError::other)?;
            if maxed {
                win.unmaximize().map_err(DesktopError::other)
            } else {
                win.maximize().map_err(DesktopError::other)
            }
        }
        WindowControlAction::Close => win.close().map_err(DesktopError::other),
    }
}

// Convenience aliases for callers that prefer one-shot commands.
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
