//! `soma://` URL routing. Mirrors the deep-link half of the old
//! Electron `startup-service.ts`, extended with a real route table:
//!
//! 1. The OS hands us a `soma://…` URL via either the `tauri-plugin-deep-link`
//!    `on_open_url` callback (initial launch & active app) or the
//!    `tauri-plugin-single-instance` `on_new_instance` handler (a duplicate
//!    launch arrives at the already-running process).
//! 2. [`dispatch`] parses it into a typed [`DeepLinkRoute`] ([`route_url`])
//!    and emits THAT (not the raw string) on the `app:deep-link` event
//!    channel (same channel name as the Electron preload contract), so
//!    the renderer matches on `route.kind` instead of re-parsing a URL.
//! 3. We bring the main window to the front.
//!
//! Kept dependency-free of the `desktop-*` libs — this module is the
//! binary's responsibility, and that boundary is clearer when the helpers
//! stay here.

use desktop_core::events::{DEEP_LINK_EVENT, DeepLinkRoute};
use tauri::{AppHandle, Emitter, Manager, Runtime};

const MAIN_LABEL: &str = "main";

/// Canonical scheme a `soma://invite/...` link always uses on the wire
/// (see `soma_common::invite_link::INVITE_LINK_SCHEME`), regardless of
/// which OS-registered scheme actually routed this particular launch to
/// the app (`soma` in prod, `soma-dev` in dev/staging — see
/// `configured_schemes`). Duplicated here as a literal rather than a new
/// Cargo dependency edge on `soma-common` just for one constant — both
/// are permanently-stable strings and this module is deliberately kept
/// dependency-free of the `desktop-*`/`soma-*` libs (see the module doc
/// comment).
const CANONICAL_LINK_SCHEME: &str = "soma";

/// Dispatch a single deep-link URL: parse it into a typed
/// [`DeepLinkRoute`], emit that to the renderer, and focus the main
/// window. Safe to call when the main window doesn't exist yet — the
/// emit still queues for any future listener; the focus call is a no-op.
pub fn dispatch<R: Runtime>(app: &AppHandle<R>, url: &str) {
    let route = route_url(app, url);
    if let Err(err) = app.emit(DEEP_LINK_EVENT, &route) {
        tracing::warn!(?err, %url, "failed to emit deep-link event");
    }
    if let Some(window) = app.get_webview_window(MAIN_LABEL) {
        focus(&window);
    }
}

/// Parse `url` into a typed [`DeepLinkRoute`] — the route table this
/// module owns. At minimum handles the invite path
/// (`soma://invite/<payload>` → [`DeepLinkRoute::Invite`]); anything else
/// becomes [`DeepLinkRoute::Unknown`] rather than being silently dropped.
///
/// Normalizes this build's OS-registered scheme (e.g. `soma-dev://` in a
/// dev build) to the canonical `soma://` invite links always carry on
/// the wire first, so a link opened against a non-prod build's own
/// scheme still decodes correctly instead of being misrouted to
/// `Unknown`.
fn route_url<R: Runtime>(app: &AppHandle<R>, url: &str) -> DeepLinkRoute {
    #[cfg(desktop)]
    let schemes = configured_schemes(app);
    #[cfg(not(desktop))]
    let schemes: Vec<String> = {
        let _ = app;
        Vec::new()
    };
    DeepLinkRoute::parse(&normalize_scheme(&schemes, url))
}

/// Pure string transformation, split out from [`route_url`] so it's
/// unit-testable without a real `AppHandle` (Tauri's config/plugin
/// accessors need a live app instance; this doesn't).
fn normalize_scheme(schemes: &[String], url: &str) -> String {
    for scheme in schemes {
        if scheme != CANONICAL_LINK_SCHEME
            && let Some(rest) = url.strip_prefix(&format!("{scheme}://"))
        {
            return format!("{CANONICAL_LINK_SCHEME}://{rest}");
        }
    }
    url.to_string()
}

/// Extract the first `<scheme>://…` argument from a process argv slice for
/// any of the given schemes. Used by the single-instance plugin to forward
/// URLs from a duplicate launch. The dev and prod builds use different
/// schemes (`soma` vs `soma-dev`), so the caller passes the schemes loaded
/// from the Tauri config.
#[cfg(desktop)]
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
#[cfg(desktop)]
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
    // `unminimize` doesn't exist on mobile — there's no minimized-window
    // state on Android/iOS, just foreground/background, which the OS
    // already handles when it hands us the deep link.
    #[cfg(desktop)]
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_scheme_rewrites_a_non_canonical_registered_scheme() {
        let schemes = vec!["soma-dev".to_string()];
        assert_eq!(
            normalize_scheme(&schemes, "soma-dev://invite/AbC123"),
            "soma://invite/AbC123"
        );
    }

    #[test]
    fn normalize_scheme_leaves_the_canonical_scheme_untouched() {
        let schemes = vec!["soma".to_string()];
        assert_eq!(
            normalize_scheme(&schemes, "soma://invite/AbC123"),
            "soma://invite/AbC123"
        );
    }

    #[test]
    fn normalize_scheme_leaves_an_unrelated_url_untouched() {
        let schemes = vec!["soma-dev".to_string()];
        assert_eq!(
            normalize_scheme(&schemes, "https://example.com/invite/AbC123"),
            "https://example.com/invite/AbC123"
        );
    }

    #[test]
    fn route_table_classifies_a_normalized_invite_link() {
        let schemes = vec!["soma-dev".to_string()];
        let normalized = normalize_scheme(&schemes, "soma-dev://invite/AbC123");
        assert_eq!(
            DeepLinkRoute::parse(&normalized),
            DeepLinkRoute::Invite {
                link: "soma://invite/AbC123".to_string()
            }
        );
    }
}
