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

/// Extract the first `<scheme>://…` argument from a process argv slice for
/// any of the given schemes. Used by the single-instance plugin to forward
/// URLs from a duplicate launch. The dev and prod builds use different
/// schemes (`soma` vs `soma-dev`), so the caller passes the schemes loaded
/// from the Tauri config.
pub fn extract_url<'a>(schemes: &[&str], argv: &'a [String]) -> Option<&'a str> {
    argv.iter().find_map(|arg| {
        schemes
            .iter()
            .any(|scheme| arg.starts_with(&format!("{scheme}://")))
            .then_some(arg.as_str())
    })
}

/// Pull the deep-link plugin's configured schemes from the loaded Tauri
/// config. Returns the schemes as owned `String`s; callers usually borrow
/// them as `&[&str]` for [`extract_url`] / plugin registration. Falls back
/// to an empty vec when the plugin isn't configured (e.g. on platforms
/// where the deep-link plugin is compiled out).
pub fn configured_schemes<R: Runtime>(app: &AppHandle<R>) -> Vec<String> {
    let Some(plugin) = app.config().plugins.0.get("deep-link") else {
        return Vec::new();
    };
    plugin
        .get("desktop")
        .and_then(|v| v.get("schemes"))
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}

fn focus<R: Runtime>(window: &tauri::WebviewWindow<R>) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}
