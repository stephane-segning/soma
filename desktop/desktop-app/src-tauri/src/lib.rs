// Soma Tauri V2 desktop binary.
//
// Mirrors the role of the old Electron `main/index.ts` + `main/container.ts`:
// build state, register plugins, register commands, run the app loop. All
// business logic lives in the `desktop-*` library crates.

use std::sync::{Arc, OnceLock};

use desktop_agent::runtime::AgentRuntime;
use desktop_commands::AppState;
use desktop_daemon::blob_reader::DaemonBlobReader;
use desktop_daemon::events::{self as daemon_events, EventBridge};
use desktop_daemon::runtime::{DaemonRuntime, DaemonRuntimeOptions};
use desktop_services::blob_protocol::SharedBlobReader;
use desktop_services::logger::{self, LoggerGuards, LoggerOptions};
use tauri::Manager;

/// Boot-only state — logger guards + the running daemon event bridge.
/// Lives in Tauri-managed state so it stays alive for the process lifetime.
pub struct BootState {
    pub logger_guards: LoggerGuards,
    pub event_bridge: Option<EventBridge>,
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
    // Holder shared between the `soma-blob://` protocol handler (registered
    // on Builder, before any window exists) and the `setup` hook that
    // actually constructs the daemon. The closure reads through the holder
    // each request so an in-flight scheme handler can wait for boot.
    let blob_reader_holder: Arc<OnceLock<SharedBlobReader>> = Arc::new(OnceLock::new());

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

    // soma-blob:// URI scheme handler.
    let reader_holder = Arc::clone(&blob_reader_holder);
    builder = builder.register_asynchronous_uri_scheme_protocol("soma-blob", move |_ctx, request, responder| {
        let reader = reader_holder.get().cloned();
        tauri::async_runtime::spawn(async move {
            let response = handle_blob_request(reader, request).await;
            responder.respond(response);
        });
    });

    builder
        .setup(move |app| {
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

            // Publish the blob reader so the protocol handler can pick it up.
            let _ = blob_reader_holder.set(DaemonBlobReader::shared(Arc::clone(&daemon)));

            // Boot the embedded runtimes asynchronously, then start the
            // event bridge once the daemon is ready.
            let app_handle = app.handle().clone();
            {
                let daemon = Arc::clone(&daemon);
                let agent = Arc::clone(&agent);
                tauri::async_runtime::spawn(async move {
                    if let Err(err) = daemon.start().await {
                        tracing::error!(?err, "daemon runtime failed to start");
                        return;
                    }
                    if let Err(err) = agent.start().await {
                        tracing::error!(?err, "agent runtime failed to start");
                    }
                    match daemon.handle().await {
                        Ok(handle) => {
                            let bridge = daemon_events::spawn(app_handle.clone(), handle, 256);
                            // Stash the bridge so it lives as long as the process.
                            app_handle.manage(BridgeState {
                                bridge: tokio::sync::Mutex::new(Some(bridge)),
                            });
                        }
                        Err(err) => {
                            tracing::error!(?err, "could not subscribe to daemon events");
                        }
                    }
                });
            }

            app.manage(AppState::new(daemon, agent));
            app.manage(BootState {
                logger_guards,
                event_bridge: None,
            });

            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register("soma");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            desktop_commands::settings_storage::db_storage_get,
            desktop_commands::settings_storage::db_storage_set,
            desktop_commands::settings_storage::db_storage_remove,
            desktop_commands::settings_storage::db_storage_clear,
            desktop_commands::settings_storage::db_storage_keys,
            desktop_commands::settings_storage::settings_get_all,
            desktop_commands::window::window_minimize,
            desktop_commands::window::window_toggle_maximize,
            desktop_commands::window::window_close,
            desktop_commands::daemon::daemon_status,
            desktop_commands::daemon::daemon_ready,
            desktop_commands::spaces::list_spaces,
            desktop_commands::spaces::create_space,
            desktop_commands::spaces::get_space,
            desktop_commands::spaces::update_space,
            desktop_commands::spaces::delete_space,
            desktop_commands::spaces::list_space_members,
            desktop_commands::spaces::list_my_memberships,
            desktop_commands::spaces::join_space,
            desktop_commands::spaces::decide_join,
            desktop_commands::documents::upsert_document,
            desktop_commands::documents::get_document,
            desktop_commands::documents::ensure_page,
            desktop_commands::documents::list_pages,
            desktop_commands::documents::update_page_title,
            desktop_commands::documents::set_page_parents,
            desktop_commands::blobs::upload_blob,
            desktop_commands::blobs::read_blob,
            desktop_commands::blobs::stage_upload,
        ])
        .on_window_event(|window, event| {
            // Intercept window-close → graceful shutdown of the embedded runtimes,
            // mirroring the old Electron `before-quit` hook in
            // `desktop/soma/src/main/services/startup-service.ts`.
            if let tauri::WindowEvent::Destroyed = event {
                let app = window.app_handle();
                let state = app.state::<AppState>();
                let daemon = Arc::clone(&state.daemon);
                let agent = Arc::clone(&state.agent);

                // Stop the event bridge first so we don't race the daemon's
                // event channel during shutdown.
                if let Some(bridge_state) = app.try_state::<BridgeState>() {
                    if let Ok(mut guard) = bridge_state.bridge.try_lock() {
                        if let Some(bridge) = guard.take() {
                            bridge.stop();
                        }
                    }
                }

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

// ---------------------------------------------------------------------------
// soma-blob:// request handling
// ---------------------------------------------------------------------------

struct BridgeState {
    bridge: tokio::sync::Mutex<Option<EventBridge>>,
}

async fn handle_blob_request(
    reader: Option<SharedBlobReader>,
    request: tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    use desktop_services::blob_protocol::parse;
    use tauri::http::Response;

    let bad_request = || {
        Response::builder()
            .status(400)
            .body(Vec::new())
            .expect("400 response is always valid")
    };
    let not_ready = || {
        Response::builder()
            .status(503)
            .body(Vec::new())
            .expect("503 response is always valid")
    };
    let not_found = || {
        Response::builder()
            .status(404)
            .body(Vec::new())
            .expect("404 response is always valid")
    };

    let Some(reader) = reader else {
        return not_ready();
    };
    let Ok((space_id, cid)) = parse(&request.uri().to_string()) else {
        return bad_request();
    };
    match reader.read_blob(&space_id, &cid).await {
        Ok(blob) => Response::builder()
            .status(200)
            .header(
                "Content-Type",
                if blob.mime.is_empty() {
                    "application/octet-stream"
                } else {
                    &blob.mime
                },
            )
            .body(blob.data)
            .unwrap_or_else(|_| not_found()),
        Err(_) => not_found(),
    }
}
