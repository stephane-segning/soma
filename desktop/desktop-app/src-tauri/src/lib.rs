// Soma Tauri V2 desktop binary.
//
// Mirrors the role of the old Electron `main/index.ts` + `main/container.ts`:
// build state, register plugins, register commands, run the app loop. All
// business logic lives in the `desktop-*` library crates.

mod agent_config_source;
mod bindings;
mod startup;

use std::sync::{Arc, OnceLock};

use desktop_agent::events::{self as agent_events, RuntimeEventStream};
use desktop_agent::runtime::AgentRuntime;
use desktop_agent::service::AgentService;
use desktop_commands::AppState;
use desktop_daemon::blob_reader::DaemonBlobReader;
use desktop_daemon::events::{self as daemon_events, EventBridge};
use desktop_daemon::runtime::{DaemonRuntime, DaemonRuntimeOptions};
use desktop_services::blob_protocol::SharedBlobReader;
use desktop_services::events::AgentEventsBroadcaster;
use desktop_services::logger::{self, LoggerGuards, LoggerOptions};
use desktop_services::practice::PracticeService;
use tauri::Manager;

use crate::agent_config_source::StoreBackedConfigSource;
use crate::startup::deep_link;
#[cfg(desktop)]
use crate::startup::menu as app_menu;
use crate::startup::splash::Splash;

const MAIN_WINDOW_LABEL: &str = "main";

/// Boot-only state that has to outlive `setup`. Tauri-managed so the
/// process owns it until shutdown.
pub struct BootState {
    pub logger_guards: LoggerGuards,
}

/// Long-running streams (daemon event bridge, agent runtime event poll).
/// Stopped explicitly on `RunEvent::ExitRequested` so we don't race the
/// daemon's own shutdown.
struct BridgeState {
    daemon_bridge: tokio::sync::Mutex<Option<EventBridge>>,
    agent_stream: tokio::sync::Mutex<Option<RuntimeEventStream>>,
}

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub tauri: String,
}

#[tauri::command]
#[specta::specta]
fn app_info(app: tauri::AppHandle) -> AppInfo {
    let info = app.package_info();
    AppInfo {
        name: info.name.clone(),
        version: info.version.to_string(),
        tauri: tauri::VERSION.into(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // tauri-specta first: collects every #[tauri::command] + side-channel
    // types, replaces `tauri::generate_handler!`, and (in dev) emits
    // `src/lib/bindings/index.ts` so the SDK's type definitions are always
    // in lockstep with the Rust handler signatures.
    let specta = bindings::build_specta();
    if let Err(err) = bindings::export_bindings(&specta) {
        tracing::warn!(?err, "tauri-specta bindings export failed");
    }

    let blob_reader_holder: Arc<OnceLock<SharedBlobReader>> = Arc::new(OnceLock::new());

    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder
            .menu(|app| app_menu::build(app))
            .on_menu_event(app_menu::on_event);
    }

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let schemes = deep_link::configured_schemes(app);
            let scheme_refs: Vec<&str> = schemes.iter().map(String::as_str).collect();
            if let Some(url) = deep_link::extract_url(&scheme_refs, &argv) {
                deep_link::dispatch(app, url);
            } else if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder = builder
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

    let reader_holder = Arc::clone(&blob_reader_holder);
    builder = builder.register_asynchronous_uri_scheme_protocol("soma-blob", move |_ctx, request, responder| {
        let reader = reader_holder.get().cloned();
        tauri::async_runtime::spawn(async move {
            let response = handle_blob_request(reader, request).await;
            responder.respond(response);
        });
    });

    let app = builder
        .setup(move |app| {
            let user_data_dir = app.path().app_data_dir().expect("app_data_dir must resolve");
            let logs_dir = app
                .path()
                .app_log_dir()
                .unwrap_or_else(|_| user_data_dir.join("logs"));

            let logger_guards = logger::init(LoggerOptions {
                log_dir: &logs_dir,
                is_dev: cfg!(debug_assertions),
            })?;

            let splash = Splash::open(&app.handle().clone()).ok();

            let daemon = Arc::new(DaemonRuntime::new(DaemonRuntimeOptions::new(&user_data_dir)));
            let agent_runtime = Arc::new(AgentRuntime::new());

            let config_source = Arc::new(StoreBackedConfigSource::new(app.handle().clone()));
            let agent_service = AgentService::new(config_source, Arc::clone(&agent_runtime));
            // Practice is process-local state (no daemon backing) — built
            // up-front so AppState is ready by the time the renderer
            // boots, matching the Electron PracticeController.
            let practice = Arc::new(PracticeService::new());

            let _ = blob_reader_holder.set(DaemonBlobReader::shared(Arc::clone(&daemon)));

            app.manage(BridgeState {
                daemon_bridge: tokio::sync::Mutex::new(None),
                agent_stream: tokio::sync::Mutex::new(None),
            });

            let app_handle = app.handle().clone();
            let daemon_for_setup = Arc::clone(&daemon);
            let agent_runtime_for_setup = Arc::clone(&agent_runtime);
            let agent_service_for_setup = Arc::clone(&agent_service);
            tauri::async_runtime::spawn(async move {
                if let Err(err) = daemon_for_setup.start().await {
                    tracing::error!(?err, "daemon runtime failed to start");
                }
                if let Err(err) = agent_runtime_for_setup.start().await {
                    tracing::error!(?err, "agent runtime failed to start");
                }
                start_event_streams(&app_handle, &daemon_for_setup, agent_service_for_setup).await;
                reveal_main_window(&app_handle);
                drop(splash);
            });

            // Renderer-source domain-event channel. Handlers in
            // `desktop-api` push to it; we install a forwarder below
            // that drains it into `app.emit(DOMAIN_EVENT, ...)` so the
            // Tauri webview reacts the same way it always did. The BFF
            // will subscribe to the same channel from its SSE handler.
            let (domain_events_tx, mut domain_events_rx) =
                tokio::sync::broadcast::channel(desktop_commands::DOMAIN_EVENT_CHANNEL_CAPACITY);
            let forwarder_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use desktop_services::events::DomainEventsBroadcaster;
                loop {
                    match domain_events_rx.recv().await {
                        Ok(event) => {
                            if let Err(err) = DomainEventsBroadcaster::broadcast(&forwarder_handle, &event) {
                                tracing::warn!(?err, "renderer-source domain_event broadcast failed");
                            }
                        }
                        // `Lagged` means our forwarder fell behind the
                        // channel capacity. Trace and keep going so the
                        // SSE / webview consumers stay live; the dropped
                        // events would have been the oldest.
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                            tracing::warn!(dropped = n, "domain_event forwarder lagged");
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                    }
                }
            });

            app.manage(AppState::new(
                daemon,
                agent_runtime,
                Arc::clone(&agent_service),
                practice,
                domain_events_tx,
            ));
            // `agent_service` is also kept as standalone state so the event
            // stream tasks (which only need the service) can reach it without
            // pulling the whole AppState.
            app.manage(agent_service);
            app.manage(BootState { logger_guards });

            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                for scheme in deep_link::configured_schemes(app.handle()) {
                    let _ = app.deep_link().register(&scheme);
                }
                let handle_for_links = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        deep_link::dispatch(&handle_for_links, url.as_str());
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(specta.invoke_handler())
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Shutdown via `RunEvent::ExitRequested` so we run on app quit (not on
    // every window destroy). This is critical on macOS where the app
    // outlives its windows: closing the main window must not tear down
    // the daemon runtimes if the user is going to re-open from the dock.
    app.run(|handle, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            api.prevent_exit();
            let handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                shutdown_runtimes(&handle).await;
                handle.exit(0);
            });
        }
    });
}

/// Boot-time helper: subscribe to the daemon firehose + start the agent
/// event poll. Stashes each stream under `BridgeState` so
/// `shutdown_runtimes` can stop them in order.
async fn start_event_streams<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    daemon: &Arc<DaemonRuntime>,
    agent_service: Arc<AgentService>,
) {
    if let Ok(handle) = daemon.handle().await {
        let bridge = daemon_events::spawn(app_handle.clone(), handle, 256);
        if let Some(state) = app_handle.try_state::<BridgeState>() {
            *state.daemon_bridge.lock().await = Some(bridge);
        }
    }
    let broadcaster_handle = app_handle.clone();
    let stream = agent_events::spawn(agent_service, move |event| {
        if let Err(err) = AgentEventsBroadcaster::broadcast(&broadcaster_handle, &event) {
            tracing::warn!(?err, "agent_event broadcast failed");
        }
    });
    if let Some(state) = app_handle.try_state::<BridgeState>() {
        *state.agent_stream.lock().await = Some(stream);
    }
}

fn reveal_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        // Tag <html> with the host platform so global CSS (notably the
        // macOS traffic-light gutter) can react. Cheaper than a JS bridge
        // call from the renderer and keeps the shell self-contained.
        let _ = window.eval(&format!(
            "document.documentElement.setAttribute('data-shell-platform', '{}')",
            shell_platform()
        ));
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Stable platform tag for the renderer to react to. Aligned with the
/// values `@tauri-apps/plugin-os`'s `platform()` returns so future code can
/// share the same vocabulary.
const fn shell_platform() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "macos"
    }
    #[cfg(target_os = "windows")]
    {
        "windows"
    }
    #[cfg(target_os = "linux")]
    {
        "linux"
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        "other"
    }
}

async fn shutdown_runtimes<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let state = app.state::<AppState>();
    let daemon = Arc::clone(&state.daemon);
    let agent_runtime = Arc::clone(&state.agent_runtime);

    if let Some(bridges) = app.try_state::<BridgeState>() {
        if let Some(bridge) = bridges.daemon_bridge.lock().await.take() {
            bridge.stop();
        }
        if let Some(stream) = bridges.agent_stream.lock().await.take() {
            stream.stop();
        }
    }

    if let Err(err) = daemon.shutdown().await {
        tracing::warn!(?err, "daemon shutdown raised; exiting anyway");
    }
    if let Err(err) = agent_runtime.shutdown().await {
        tracing::warn!(?err, "agent shutdown raised; exiting anyway");
    }
}

async fn handle_blob_request(
    reader: Option<SharedBlobReader>,
    request: tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    use desktop_services::blob_protocol::parse;
    use tauri::http::Response;

    let mk = |status: u16| {
        Response::builder()
            .status(status)
            .body(Vec::new())
            .expect("status response is valid")
    };

    let Some(reader) = reader else { return mk(503) };
    let Ok((space_id, cid)) = parse(&request.uri().to_string()) else {
        return mk(400);
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
            .unwrap_or_else(|_| mk(404)),
        Err(_) => mk(404),
    }
}
