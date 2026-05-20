//! Window controls. Replaces `controllers/window-controller.ts` +
//! `command-registry/window-log-handlers.ts`. Renderer call sites use
//! `window:control` with an `action` discriminator; we accept the same
//! shape so the cutover doesn't need a rename.
//!
//! Commands are monomorphic on the default `tauri::Wry` runtime (i.e.
//! they take `AppHandle` without an `<R: Runtime>` parameter) so
//! `tauri-specta` can collect them without generic-inference errors.

use desktop_core::error::{DesktopError, DesktopResult};
use serde::Deserialize;
use specta::Type;

#[derive(Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WindowControlArgs {
    pub action: WindowControlAction,
}

#[derive(Debug, Clone, Copy, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum WindowControlAction {
    Minimize,
    ToggleMaximize,
    Close,
}

fn window(app: &tauri::AppHandle) -> DesktopResult<tauri::WebviewWindow> {
    use tauri::Manager;
    app.get_webview_window("main").ok_or_else(|| DesktopError::other("no main window"))
}

#[tauri::command]
#[specta::specta]
pub async fn window_control(app: tauri::AppHandle, args: WindowControlArgs) -> DesktopResult<()> {
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

#[tauri::command]
#[specta::specta]
pub async fn window_minimize(app: tauri::AppHandle) -> DesktopResult<()> {
    window(&app)?.minimize().map_err(DesktopError::other)
}

#[tauri::command]
#[specta::specta]
pub async fn window_toggle_maximize(app: tauri::AppHandle) -> DesktopResult<()> {
    let win = window(&app)?;
    let maxed = win.is_maximized().map_err(DesktopError::other)?;
    if maxed {
        win.unmaximize().map_err(DesktopError::other)
    } else {
        win.maximize().map_err(DesktopError::other)
    }
}

#[tauri::command]
#[specta::specta]
pub async fn window_close(app: tauri::AppHandle) -> DesktopResult<()> {
    window(&app)?.close().map_err(DesktopError::other)
}
