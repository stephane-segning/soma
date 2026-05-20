// Soma Tauri V2 desktop binary.
//
// Mirrors the role of the old Electron `main/index.ts` + `main/container.ts`:
// build state, register plugins, register commands, run the app loop. All
// business logic lives in the `desktop-*` library crates.

mod agent_config_source;

use std::sync::{Arc, OnceLock};

use desktop_agent::events::{RuntimeEventStream, self as agent_events};
use desktop_agent::runtime::AgentRuntime;
use desktop_agent::service::AgentService;
use desktop_commands::AppState;
use desktop_daemon::blob_reader::DaemonBlobReader;
use desktop_daemon::events::{self as daemon_events, EventBridge};
use desktop_daemon::runtime::{DaemonRuntime, DaemonRuntimeOptions};
use desktop_services::blob_protocol::SharedBlobReader;
use desktop_services::events::AgentEventsBroadcaster;
use desktop_services::logger::{self, LoggerGuards, LoggerOptions};
use tauri::Manager;

use crate::agent_config_source::StoreBackedConfigSource;

/// Boot-only state — logger guards plus the running background streams.
/// Lives in Tauri-managed state for the process lifetime.
pub struct BootState {
    pub logger_guards: LoggerGuards,
}

struct BridgeState {
    daemon_bridge: tokio::sync::Mutex<Option<EventBridge>>,
    agent_stream: tokio::sync::Mutex<Option<RuntimeEventStream>>,
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

    // soma-blob:// URI scheme handler. Registered on Builder, so we hand
    // it a `OnceLock` the setup hook fills once the daemon is constructed.
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
            let agent_runtime = Arc::new(AgentRuntime::new());

            // AgentService reads config from tauri-plugin-store on every call
            // so users editing settings see the change without a restart.
            let config_source = Arc::new(StoreBackedConfigSource::new(app.handle().clone()));
            let agent_service = AgentService::new(config_source, Arc::clone(&agent_runtime));

            // Publish the blob reader so the protocol handler can pick it up.
            let _ = blob_reader_holder.set(DaemonBlobReader::shared(Arc::clone(&daemon)));

            let bridges = BridgeState {
                daemon_bridge: tokio::sync::Mutex::new(None),
                agent_stream: tokio::sync::Mutex::new(None),
            };
            app.manage(bridges);

            // Boot the embedded runtimes asynchronously and then spawn the
            // event streams. Each stream is parked under `BridgeState` so the
            // window-destroyed hook can stop them in the right order.
            let app_handle = app.handle().clone();
            let daemon_for_setup = Arc::clone(&daemon);
            let agent_runtime_for_setup = Arc::clone(&agent_runtime);
            let agent_service_for_setup = Arc::clone(&agent_service);
            tauri::async_runtime::spawn(async move {
                if let Err(err) = daemon_for_setup.start().await {
                    tracing::error!(?err, "daemon runtime failed to start");
                    return;
                }
                if let Err(err) = agent_runtime_for_setup.start().await {
                    tracing::error!(?err, "agent runtime failed to start");
                }
                if let Ok(handle) = daemon_for_setup.handle().await {
                    let bridge = daemon_events::spawn(app_handle.clone(), handle, 256);
                    if let Some(state) = app_handle.try_state::<BridgeState>() {
                        *state.daemon_bridge.lock().await = Some(bridge);
                    }
                }
                let broadcaster_handle = app_handle.clone();
                let stream = agent_events::spawn(agent_service_for_setup, move |event| {
                    if let Err(err) = AgentEventsBroadcaster::broadcast(&broadcaster_handle, &event) {
                        tracing::warn!(?err, "agent_event broadcast failed");
                    }
                });
                if let Some(state) = app_handle.try_state::<BridgeState>() {
                    *state.agent_stream.lock().await = Some(stream);
                }
            });

            app.manage(AppState::new(daemon, agent_runtime));
            app.manage(agent_service);
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
            desktop_commands::agent::agent_chat_stream,
            desktop_commands::agent::agent_list_models,
            desktop_commands::agent::agent_rerank,
            desktop_commands::agent::agent_resolve_drift,
            desktop_commands::agent::agent_enqueue_background_task,
            desktop_commands::agent::agent_list_background_tasks,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let app = window.app_handle();
                let state = app.state::<AppState>();
                let daemon = Arc::clone(&state.daemon);
                let agent = Arc::clone(&state.agent);

                if let Some(bridges) = app.try_state::<BridgeState>() {
                    if let Ok(mut guard) = bridges.daemon_bridge.try_lock() {
                        if let Some(bridge) = guard.take() {
                            bridge.stop();
                        }
                    }
                    if let Ok(mut guard) = bridges.agent_stream.try_lock() {
                        if let Some(stream) = guard.take() {
                            stream.stop();
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

async fn handle_blob_request(
    reader: Option<SharedBlobReader>,
    request: tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    use desktop_services::blob_protocol::parse;
    use tauri::http::Response;

    let mk = |status: u16| Response::builder().status(status).body(Vec::new()).expect("status response is valid");

    let Some(reader) = reader else { return mk(503) };
    let Ok((space_id, cid)) = parse(&request.uri().to_string()) else { return mk(400) };

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
            .unwrap_or_else(|_| mk(404)),
        Err(_) => mk(404),
    }
}
