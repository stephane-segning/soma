// Soma Tauri V2 desktop binary.
//
// Mirrors the role of the old Electron `main/index.ts` + `main/container.ts`:
// build state, register plugins, register commands, run the app loop. All
// business logic lives in the `desktop-*` library crates.

use std::sync::Arc;

use desktop_agent::runtime::AgentRuntime;
use desktop_commands::AppState;
use desktop_daemon::runtime::{DaemonRuntime, DaemonRuntimeOptions};
use desktop_services::logger::{self, LoggerGuards, LoggerOptions};
use tauri::Manager;

/// Boot-only state — only the logger guards live here. Daemon / agent
/// references live inside `AppState` so commands can reach them via
/// `tauri::State`.
pub struct BootState {
    pub logger_guards: LoggerGuards,
}

#[tauri::command]
fn app_info(app: tauri::AppHandle) -> serde_json::Value {
    let info = app.package_info();
    serde_json::json!({
        "name": info.name,
        "version": info.version.to_string(),
        "tauri": tauri::VERSION,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build());

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_window_state::Builder::default().build())
            .plugin(tauri_plugin_deep_link::init())
            .plugin(tauri_plugin_updater::Builder::default().build());
    }

    builder
        .setup(|app| {
            let user_data_dir = app
                .path()
                .app_data_dir()
                .expect("app_data_dir must resolve");
            let logs_dir = app
                .path()
                .app_log_dir()
                .unwrap_or_else(|_| user_data_dir.join("logs"));

            let logger_guards = logger::init(LoggerOptions {
                log_dir: &logs_dir,
                is_dev: cfg!(debug_assertions),
            })?;

            let daemon = Arc::new(DaemonRuntime::new(DaemonRuntimeOptions::new(&user_data_dir)));
            let agent = Arc::new(AgentRuntime::new());

            // Boot the embedded runtimes asynchronously so the window opens
            // immediately; commands that need them already lock-and-wait.
            {
                let daemon = Arc::clone(&daemon);
                let agent = Arc::clone(&agent);
                tauri::async_runtime::spawn(async move {
                    if let Err(err) = daemon.start().await {
                        tracing::error!(?err, "daemon runtime failed to start");
                    }
                    if let Err(err) = agent.start().await {
                        tracing::error!(?err, "agent runtime failed to start");
                    }
                });
            }

            app.manage(AppState::new(daemon, agent));
            app.manage(BootState { logger_guards });

            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register("soma");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            // Storage / settings.
            desktop_commands::settings_storage::db_storage_get,
            desktop_commands::settings_storage::db_storage_set,
            desktop_commands::settings_storage::db_storage_remove,
            desktop_commands::settings_storage::db_storage_clear,
            desktop_commands::settings_storage::db_storage_keys,
            desktop_commands::settings_storage::settings_get_all,
            // Window controls.
            desktop_commands::window::window_minimize,
            desktop_commands::window::window_toggle_maximize,
            desktop_commands::window::window_close,
            // Daemon status.
            desktop_commands::daemon::daemon_status,
            desktop_commands::daemon::daemon_ready,
            // Spaces / membership / joins.
            desktop_commands::spaces::list_spaces,
            desktop_commands::spaces::create_space,
            desktop_commands::spaces::get_space,
            desktop_commands::spaces::update_space,
            desktop_commands::spaces::delete_space,
            desktop_commands::spaces::list_space_members,
            desktop_commands::spaces::list_my_memberships,
            desktop_commands::spaces::join_space,
            desktop_commands::spaces::decide_join,
            // Documents + pages.
            desktop_commands::documents::upsert_document,
            desktop_commands::documents::get_document,
            desktop_commands::documents::ensure_page,
            desktop_commands::documents::list_pages,
            desktop_commands::documents::update_page_title,
            desktop_commands::documents::set_page_parents,
            // Blobs.
            desktop_commands::blobs::upload_blob,
            desktop_commands::blobs::read_blob,
            desktop_commands::blobs::stage_upload,
        ])
        .on_window_event(|window, event| {
            // Intercept window-close → graceful shutdown of the embedded runtimes,
            // mirroring the old Electron `before-quit` hook in
            // `desktop/soma/src/main/services/startup-service.ts`.
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.app_handle().state::<AppState>();
                let daemon = Arc::clone(&state.daemon);
                let agent = Arc::clone(&state.agent);
                tauri::async_runtime::block_on(async move {
                    if let Err(err) = daemon.shutdown().await {
                        tracing::warn!(?err, "daemon shutdown raised; exiting anyway");
                    }
                    if let Err(err) = agent.shutdown().await {
                        tracing::warn!(?err, "agent shutdown raised; exiting anyway");
                    }
                });
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
