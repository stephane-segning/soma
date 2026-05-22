//! Boot-time concerns for the Tauri shell. Each submodule replaces one
//! piece of the old Electron `startup-service.ts`:
//!
//! * [`splash`] — splash window opened while the daemon boots, RAII-closed
//!   when the guard drops.
//! * [`deep_link`] — `soma://` URL routing: emits `app:deep-link` to the
//!   renderer and focuses the main window.
//! * [`menu`] — native menu bar (macOS / Windows / Linux). Predefined items
//!   for Edit/Window/Quit; custom items emit `app:menu-action`.
//!
//! The main window itself is described in `tauri.conf.json` (`app.windows[0]`)
//! and persisted by `tauri-plugin-window-state` — no Rust glue needed.

pub mod deep_link;
#[cfg(desktop)]
pub mod menu;
pub mod splash;
