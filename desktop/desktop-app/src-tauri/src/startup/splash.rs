//! Splash window shown while the embedded daemon + agent runtimes boot.
//!
//! Loads a self-contained `data:text/html` document so the splash has no
//! dependency on the renderer build — useful because the renderer's vite
//! server may not be up yet in dev mode. The HTML mirrors the look of
//! `desktop/soma/src/main/services/startup-service/splash-window.ts` so
//! the visual experience is identical across the two desktop binaries
//! during the migration.

use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const SPLASH_LABEL: &str = "splash";
const SPLASH_HTML: &str = include_str!("splash.html");

/// RAII guard: the splash window is open for as long as this value lives.
pub struct Splash<R: Runtime> {
    window: WebviewWindow<R>,
}

impl<R: Runtime> Splash<R> {
    /// Open the splash window. Idempotent — returns the existing window if
    /// `open` was already called (so multiple `setup` re-entries don't pile
    /// up windows).
    pub fn open(app: &AppHandle<R>) -> tauri::Result<Self> {
        if let Some(existing) = app.get_webview_window(SPLASH_LABEL) {
            return Ok(Self { window: existing });
        }

        let url = format!("data:text/html;charset=utf-8,{}", urlencode(SPLASH_HTML));
        let builder =
            WebviewWindowBuilder::new(app, SPLASH_LABEL, WebviewUrl::External(url.parse().expect("data url")))
                .title("Soma — starting…")
                .inner_size(460.0, 320.0)
                .resizable(false)
                .decorations(false)
                .center()
                .always_on_top(true)
                .visible(false)
                .focused(true);
        let window = builder.build()?;
        let _ = window.show();
        Ok(Self { window })
    }

}

impl<R: Runtime> Drop for Splash<R> {
    fn drop(&mut self) {
        let _ = self.window.close();
    }
}

/// Percent-encode for `data:` URLs. Only the RFC 3986 unreserved set is
/// safe to leave verbatim — anything else, especially `#` (which would
/// start a fragment and silently truncate the rest of the splash HTML),
/// must be encoded.
fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(byte as char),
            _ => {
                out.push('%');
                out.push_str(&format!("{byte:02X}"));
            }
        }
    }
    out
}
