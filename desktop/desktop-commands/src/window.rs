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

// `minimize`/`maximize`/`unmaximize` only exist on `tauri::WebviewWindow`
// on desktop — there's no windowing system on Android/iOS for them to act
// on. The renderer's custom titlebar (with its minimize/maximize/close
// buttons) is itself a desktop-only surface (see the responsive shell
// work), so these are unreachable from mobile UI in practice; the mobile
// arms are a no-op safety net rather than a real behavior, so the command
// surface stays uniform across platforms.
//
// This crate has no `tauri-build` build script of its own (only the
// `desktop-app` binary does), so the tauri-provided `cfg(desktop)` /
// `cfg(mobile)` aliases aren't defined here — both would silently
// evaluate to false. Use the equivalent `target_os` predicate directly
// instead (this is what `mobile = target_os == "ios" || target_os ==
// "android"` in tauri-build reduces to).

#[tauri::command]
#[specta::specta]
pub async fn window_control(app: tauri::AppHandle, args: WindowControlArgs) -> DesktopResult<()> {
    let win = window(&app)?;
    match args.action {
        #[cfg(not(any(target_os = "ios", target_os = "android")))]
        WindowControlAction::Minimize => win.minimize().map_err(DesktopError::other),
        #[cfg(not(any(target_os = "ios", target_os = "android")))]
        WindowControlAction::ToggleMaximize => {
            let maxed = win.is_maximized().map_err(DesktopError::other)?;
            if maxed {
                win.unmaximize().map_err(DesktopError::other)
            } else {
                win.maximize().map_err(DesktopError::other)
            }
        }
        #[cfg(any(target_os = "ios", target_os = "android"))]
        WindowControlAction::Minimize | WindowControlAction::ToggleMaximize => Ok(()),
        WindowControlAction::Close => win.close().map_err(DesktopError::other),
    }
}

#[tauri::command]
#[specta::specta]
pub async fn window_minimize(app: tauri::AppHandle) -> DesktopResult<()> {
    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    {
        window(&app)?.minimize().map_err(DesktopError::other)
    }
    #[cfg(any(target_os = "ios", target_os = "android"))]
    {
        let _ = app;
        Ok(())
    }
}

#[tauri::command]
#[specta::specta]
pub async fn window_toggle_maximize(app: tauri::AppHandle) -> DesktopResult<()> {
    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    {
        let win = window(&app)?;
        let maxed = win.is_maximized().map_err(DesktopError::other)?;
        if maxed {
            win.unmaximize().map_err(DesktopError::other)
        } else {
            win.maximize().map_err(DesktopError::other)
        }
    }
    #[cfg(any(target_os = "ios", target_os = "android"))]
    {
        let _ = app;
        Ok(())
    }
}

#[tauri::command]
#[specta::specta]
pub async fn window_close(app: tauri::AppHandle) -> DesktopResult<()> {
    window(&app)?.close().map_err(DesktopError::other)
}
