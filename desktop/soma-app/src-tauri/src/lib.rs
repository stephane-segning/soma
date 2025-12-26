use tracing::info;
use tauri::http;
use tauri_plugin_deep_link::{DeepLinkExt, OpenUrlEvent};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_deep_link::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|_app, argv, _cwd| {
            println!("a new app instance was opened with {argv:?} and the deep link event was already triggered");
            // when defining deep link schemes at runtime, you must also check `argv` here
        }));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .register_uri_scheme_protocol("soma-blob", |_ctx, request| {
            // skip leading `/`
            let uri = request.uri();
            info!("miaou {uri}");
            if let Ok(data) = std::fs::read(&uri.path()[1..]) {
                http::Response::builder().body(data).unwrap()
            } else {
                http::Response::builder()
                    .status(http::StatusCode::BAD_REQUEST)
                    .header(http::header::CONTENT_TYPE, mime::TEXT_PLAIN.essence_str())
                    .body("failed to read file".as_bytes().to_vec())
                    .unwrap()
            }
        })
        .setup(|app| {
            // Note that get_current's return value will also get updated every time on_open_url gets triggered.
            let start_urls = app.deep_link().get_current()?;
            if let Some(urls) = start_urls {
                // app was likely started by a deep link
                println!("deep link URLs: {:?}", urls);
            }

            app.deep_link().on_open_url(|event: OpenUrlEvent| {
                println!("deep link URLs: {:?}", event.urls());
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
