mod commands;
mod daemon;
mod error;
mod handlers;
mod transport;

use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            let app_handle = app.handle();
            let daemon = crate::daemon::DaemonApi::from_app(&app_handle)?;
            let greeting = crate::handlers::greeting::GreetingController::new();
            let exercises = crate::handlers::exercises::ExercisesController::new(daemon.clone());

            app.manage(daemon);
            app.manage(greeting);
            app.manage(exercises);

            if let Some(start_urls) = app_handle.deep_link().get_current()? {
                crate::handlers::deep_link::DeepLinkController::emit_from_urls(
                    &app_handle,
                    start_urls.as_slice(),
                )?;
            }

            let handle = app_handle.clone();
            app_handle.deep_link().on_open_url(move |event| {
                let urls = event.urls();
                let _ = crate::handlers::deep_link::DeepLinkController::emit_from_urls(
                    &handle,
                    urls.as_slice(),
                );
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            crate::commands::greet,
            crate::commands::stage_exercise,
            crate::commands::record_benchmark
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
