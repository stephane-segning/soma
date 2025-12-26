use std::sync::Arc;

use tauri::{Manager, Wry};
use tauri_plugin_deep_link::DeepLinkExt;
use tracing::info;

use crate::{
    bootstrap::{Bootstrapper, MainBootstrap},
    commands::{AppCommandHandler, CommandHandler, CommandState},
    daemon::DaemonApi,
    protocol::{BlobProtocol, ProtocolRegistrar},
    state::{AppStateStore, FileStateStore, ManagedState},
    window::{MainWindowController, WindowController},
};

pub struct SomaAppBuilder {
    builder: tauri::Builder<Wry>,
    bootstrapper: Arc<dyn Bootstrapper>,
    window_controller: Arc<dyn WindowController>,
    protocol_registrars: Vec<Arc<dyn ProtocolRegistrar>>,
    state_store: Arc<dyn AppStateStore>,
}

impl SomaAppBuilder {
    pub fn new() -> Self {
        let state_store: Arc<dyn AppStateStore> = Arc::new(FileStateStore::default());
        let bootstrapper: Arc<dyn Bootstrapper> = Arc::new(MainBootstrap::new());
        let window_controller: Arc<dyn WindowController> =
            Arc::new(MainWindowController::new(state_store.clone()));

        let builder = tauri::Builder::default()
            .plugin(
                tauri_plugin_log::Builder::new()
                    .level(tauri_plugin_log::log::LevelFilter::Info)
                    .build(),
            )
            .plugin(tauri_plugin_opener::init())
            .plugin(tauri_plugin_deep_link::init());

        #[cfg(desktop)]
        let builder = builder.plugin(tauri_plugin_single_instance::init(|_app, argv, _cwd| {
            info!("another instance attempted to start with args: {argv:?}");
        }));

        Self {
            builder,
            bootstrapper,
            window_controller,
            protocol_registrars: vec![Arc::new(BlobProtocol::new())],
            state_store,
        }
    }

    pub fn build(self) -> SomaApp {
        SomaApp {
            builder: self.builder,
            bootstrapper: self.bootstrapper,
            window_controller: self.window_controller,
            protocol_registrars: self.protocol_registrars,
            state_store: self.state_store,
        }
    }
}

pub struct SomaApp {
    builder: tauri::Builder<Wry>,
    bootstrapper: Arc<dyn Bootstrapper>,
    window_controller: Arc<dyn WindowController>,
    protocol_registrars: Vec<Arc<dyn ProtocolRegistrar>>,
    state_store: Arc<dyn AppStateStore>,
}

impl SomaApp {
    pub fn run(self) -> tauri::Result<()> {
        let context = tauri::generate_context!();
        let mut builder = self.builder;
        for registrar in self.protocol_registrars {
            builder = registrar.attach(builder);
        }

        let bootstrapper = Arc::clone(&self.bootstrapper);
        let window_controller = Arc::clone(&self.window_controller);
        let state_store = Arc::clone(&self.state_store);

        builder
            .setup(move |app| {
                let daemon = DaemonApi::from_app(&app.handle())?;
                let managed_state = Arc::new(ManagedState::new(state_store.clone(), daemon));
                let command_handler: Arc<dyn CommandHandler> =
                    Arc::new(AppCommandHandler::new(managed_state.clone()));
                let command_state = CommandState::new(command_handler);
                app.manage(managed_state);
                app.manage(command_state);

                let handle = app.handle();
                bootstrapper.clone().init(&handle)?;
                window_controller.clone().create_or_restore(&handle)?;

                if let Some(start_urls) = app.deep_link().get_current()? {
                    info!("app started from deep link: {start_urls:?}");
                }
                app.deep_link().on_open_url(|event| {
                    info!("received deep link URLs: {:?}", event.urls());
                });
                Ok(())
            })
            .invoke_handler(tauri::generate_handler![
                crate::commands::remember_route,
                crate::commands::documents_upsert_draft,
                crate::commands::documents_queue_daemon_sync,
                crate::commands::documents_sync_published,
                crate::commands::blobs_stage,
                crate::commands::documents_get_draft,
                crate::commands::documents_ensure_page,
                crate::commands::documents_list_pages,
                crate::commands::documents_update_page_title,
                crate::commands::documents_set_page_parents,
                crate::commands::settings_get_last_route,
                crate::commands::settings_get,
                crate::commands::settings_set
            ])
            .run(context)
    }
}

pub struct AppEntrypoint {
    builder: SomaAppBuilder,
}

impl AppEntrypoint {
    pub fn new() -> Self {
        Self {
            builder: SomaAppBuilder::new(),
        }
    }

    pub fn run(self) -> tauri::Result<()> {
        self.builder.build().run()
    }
}
