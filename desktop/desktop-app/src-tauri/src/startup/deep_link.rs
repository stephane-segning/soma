//! `soma://` URL routing. Mirrors the deep-link half of the old
//! Electron `startup-service.ts`:
//!
//! 1. The OS hands us a `soma://…` URL via either the `tauri-plugin-deep-link`
//!    `on_open_url` callback (initial launch & active app) or the
//!    `tauri-plugin-single-instance` `on_new_instance` handler (a duplicate
//!    launch arrives at the already-running process).
//! 2. We emit it on the `app:deep-link` event channel (same name as the
//!    Electron preload contract) so the renderer can route accordingly.
//! 3. We bring the main window to the front.
//!
//! Kept dependency-free of the `desktop-*` libs — this module is the
//! binary's responsibility, and that boundary is clearer when the helpers
//! stay here.

use desktop_core::events::DEEP_LINK_EVENT;
use tauri::{AppHandle, Emitter, Manager, Runtime};

const MAIN_LABEL: &str = "main";

/// Dispatch a single deep-link URL: emit to the renderer and focus the
/// main window. Safe to call when the main window doesn't exist yet — the
/// emit still queues for any future listener; the focus call is a no-op.
pub fn dispatch<R: Runtime>(app: &AppHandle<R>, url: &str) {
    if let Err(err) = app.emit(DEEP_LINK_EVENT, url) {
        tracing::warn!(?err, %url, "failed to emit deep-link event");
    }
    if let Some(window) = app.get_webview_window(MAIN_LABEL) {
        focus(&window);
    }
}

/// Extract the first `soma://…` argument from a process argv slice. Used by
/// the single-instance plugin to forward URLs from a duplicate launch.
pub fn extract_url<'a>(scheme: &str, argv: &'a [String]) -> Option<&'a str> {
    let prefix = format!("{scheme}://");
    argv.iter().find_map(|arg| arg.starts_with(&prefix).then_some(arg.as_str()))
}

fn focus<R: Runtime>(window: &tauri::WebviewWindow<R>) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}
