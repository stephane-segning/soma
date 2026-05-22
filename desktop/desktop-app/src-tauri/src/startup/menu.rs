//! Native macOS / Windows / Linux menu bar.
//!
//! Replaces the implicit Electron-default menu with an explicit, Soma-shaped
//! menu so the Tauri shell *feels* like a real desktop app: cmd+N opens a new
//! page, cmd+/ toggles the spaces rail, the About panel shows Soma metadata,
//! and the standard Edit / Window items wire to the focused webview for free.
//!
//! Menu items that don't map to a platform predefined action are
//! **emit-only**: clicking them dispatches an [`MENU_EVENT`] (`app:menu-action`)
//! with the item id (`menu:new-page`, etc.) to the renderer. The renderer
//! router (Phase 4) is responsible for the actual behaviour; the binary only
//! owns the keystrokes and the OS-level chrome.
//!
//! `devtools` and `tauri::menu::PredefinedMenuItem` carry their own platform
//! restrictions (no Undo on Windows/Linux, no Bring-All-to-Front off macOS).
//! We rely on the builder's `_with_text` / native fallthrough rather than
//! special-casing; on platforms where the predefined item is unsupported the
//! corresponding builder call is simply a no-op.

use desktop_core::events::MENU_EVENT;
use tauri::menu::{AboutMetadataBuilder, Menu, MenuBuilder, MenuEvent, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_opener::OpenerExt;

/// Menu-item ids the renderer reacts to. Stable wire format — adding new
/// items is fine, but **don't rename existing ones** without a renderer
/// update on the other side of the bridge.
pub mod ids {
    pub const NEW_PAGE: &str = "menu:new-page";
    pub const NEW_SPACE: &str = "menu:new-space";
    pub const TOGGLE_SPACES_RAIL: &str = "menu:toggle-spaces-rail";
    pub const TOGGLE_CHAT_SIDEBAR: &str = "menu:toggle-chat-sidebar";
    pub const HELP_DOCS: &str = "menu:help-docs";
}

const DOCS_URL: &str = "https://github.com/stephane-ssegning/soma";

/// Build the application menu. Called from the `Builder::menu(...)` callback
/// so Tauri attaches it as the global menubar (macOS) or per-window menu
/// (Windows/Linux).
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let pkg = app.package_info();
    let about = AboutMetadataBuilder::new()
        .name(Some(pkg.name.clone()))
        .version(Some(pkg.version.to_string()))
        .copyright(Some(format!("Copyright (c) {} Soma authors", current_year())))
        .authors(Some(vec!["Stephane Segning <selastlambou@gmail.com>".into()]))
        .website(Some(DOCS_URL.to_string()))
        .website_label(Some::<String>("Soma on GitHub".into()))
        .build();

    let mut menu = MenuBuilder::new(app);

    // Application menu (auto-promoted on macOS to the bold "Soma" item).
    // Predefined items here cover Hide / Hide-others / Show-all / Quit; we
    // only add the About item explicitly so the metadata block above shows
    // up correctly.
    #[cfg(target_os = "macos")]
    {
        let app_menu = SubmenuBuilder::new(app, pkg.name.clone())
            .about(Some(about.clone()))
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .quit()
            .build()?;
        menu = menu.item(&app_menu);
    }

    // File
    let new_page = MenuItemBuilder::with_id(ids::NEW_PAGE, "New Page")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let new_space = MenuItemBuilder::with_id(ids::NEW_SPACE, "New Space")
        .accelerator("CmdOrCtrl+Shift+N")
        .build(app)?;
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&new_page)
        .item(&new_space)
        .separator()
        .close_window()
        .build()?;
    menu = menu.item(&file_menu);

    // Edit — every item is a predefined; macOS auto-wires them to the focused
    // webview's text fields. On Windows/Linux the `undo`/`redo` builder calls
    // are documented as no-ops, which is fine: TipTap owns its own history.
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    menu = menu.item(&edit_menu);

    // View
    let toggle_rail = MenuItemBuilder::with_id(ids::TOGGLE_SPACES_RAIL, "Toggle Spaces Rail")
        .accelerator("CmdOrCtrl+/")
        .build(app)?;
    let toggle_chat = MenuItemBuilder::with_id(ids::TOGGLE_CHAT_SIDEBAR, "Toggle Chat Sidebar")
        .accelerator("CmdOrCtrl+Shift+/")
        .build(app)?;
    let mut view = SubmenuBuilder::new(app, "View")
        .item(&toggle_rail)
        .item(&toggle_chat)
        .separator();
    // Reload — the builder doesn't expose a predefined "reload" yet, so we
    // wire it via emit-on-click below. Same channel as the other custom
    // items keeps the renderer's reducer simple.
    let reload = MenuItemBuilder::with_id("menu:reload", "Reload")
        .accelerator("CmdOrCtrl+R")
        .build(app)?;
    view = view.item(&reload);
    #[cfg(feature = "devtools")]
    {
        let devtools_item = MenuItemBuilder::with_id("menu:toggle-devtools", "Toggle Developer Tools")
            .accelerator("CmdOrCtrl+Alt+I")
            .build(app)?;
        view = view.item(&devtools_item);
    }
    menu = menu.item(&view.build()?);

    // Window — predefined-only.
    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .bring_all_to_front()
        .build()?;
    menu = menu.item(&window_menu);

    // Help
    let docs = MenuItemBuilder::with_id(ids::HELP_DOCS, "Soma Documentation").build(app)?;
    // macOS hoists the About item into the app menu, so on Windows/Linux we
    // surface a second About entry under Help — that's where users on those
    // platforms actually look for it.
    #[cfg(target_os = "macos")]
    let help = {
        let _ = about; // about lives in the app menu above; silence warnings.
        SubmenuBuilder::new(app, "Help").item(&docs)
    };
    #[cfg(not(target_os = "macos"))]
    let help = SubmenuBuilder::new(app, "Help")
        .item(&docs)
        .separator()
        .about(Some(about));
    menu = menu.item(&help.build()?);

    menu.build()
}

/// Global menu-event handler: forwards custom ids to the renderer and
/// short-circuits a few that the shell can serve locally (reload, devtools,
/// help-docs URL).
pub fn on_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id().as_ref();
    match id {
        "menu:reload" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval("window.location.reload()");
            }
        }
        #[cfg(feature = "devtools")]
        "menu:toggle-devtools" => {
            if let Some(window) = app.get_webview_window("main") {
                if window.is_devtools_open() {
                    window.close_devtools();
                } else {
                    window.open_devtools();
                }
            }
        }
        ids::HELP_DOCS => {
            if let Err(err) = app.opener().open_url(DOCS_URL, None::<&str>) {
                tracing::warn!(?err, "failed to open docs URL");
            }
        }
        // Everything else is renderer-routed: emit + let Phase-4 decide.
        other if other.starts_with("menu:") => {
            if let Err(err) = app.emit(MENU_EVENT, other) {
                tracing::warn!(?err, %other, "menu emit failed");
            }
        }
        _ => {}
    }
}

/// `chrono` would be overkill for the about-panel copyright string, so we
/// pull the build year from the `BUILD_YEAR` env var if set (CI may inject
/// it) and otherwise fall back to a static constant that gets bumped by
/// hand. The exact year is cosmetic — getting it right *eventually* matters
/// more than getting it perfect at boot.
fn current_year() -> u32 {
    option_env!("BUILD_YEAR")
        .and_then(|s| s.parse().ok())
        .unwrap_or(2026)
}
