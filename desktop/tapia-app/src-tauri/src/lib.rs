mod commands;
mod error;
mod handlers;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(crate::handlers::greeting::GreetingController::new())
        .invoke_handler(tauri::generate_handler![crate::commands::greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
